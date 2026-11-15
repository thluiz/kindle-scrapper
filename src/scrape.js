// Scraper do Kindle Notebook (read.amazon.com/notebook) via Playwright.
//
// Estratégia de auth: a Amazon não tem API. Na primeira vez você loga à mão
// (browser visível, incluindo 2FA) e o estado de sessão é salvo em
// auth/storageState.json. Execuções seguintes reusam esse cookie em headless.
//
// ⚠️ Os seletores abaixo refletem a estrutura conhecida do Notebook em 2025/2026.
//    A Amazon muda o DOM de tempos em tempos — se o scrape voltar 0 livros,
//    rode `kindle sync --headful --debug` e ajuste os seletores marcados com [SEL].
import fs from 'node:fs';
import path from 'node:path';

const NOTEBOOK_URL = 'https://read.amazon.com/notebook';
const LIB_SEL = '.kp-notebook-library-each-book'; // [SEL] lista de livros na coluna esquerda

// Estratégia de sessão (2026-11-15): um PERFIL de navegador persistente (auth/profile/), o mesmo no login
// (visível) e no sync (headless). Antes, o login usava um Chromium descartável e o sync outro binário
// (chromium_headless_shell, user agent "HeadlessChrome"), só com os cookies copiados. Para a Amazon
// eram dois aparelhos diferentes, e a sessão caía em menos de 24h. Agora: mesmo binário (channel
// 'chromium', headless novo), mesmo perfil (cookies + localStorage + IndexedDB) e mesmo user agent.
// auth/storageState.json continua sendo gravado como cópia, e serve para migrar um perfil vazio.
function paths(storageStatePath) {
  const dir = path.dirname(storageStatePath);
  return { dir, profile: path.join(dir, 'profile'), ua: path.join(dir, 'ua.json'), lock: path.join(dir, 'profile.lock') };
}

// Um perfil só aceita um navegador por vez (sync, sonda e login podem se cruzar no agendador).
async function acquireLock(lock, waitMs = 10 * 60 * 1000) {
  const t0 = Date.now();
  for (;;) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); return () => fs.rmSync(lock, { force: true }); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let stale = false;
      try {
        const pid = Number(fs.readFileSync(lock, 'utf8'));
        try { process.kill(pid, 0); } catch { stale = true; }        // dono morreu
        if (Date.now() - fs.statSync(lock).mtimeMs > 30 * 60 * 1000) stale = true;
      } catch { stale = true; }
      if (stale) { fs.rmSync(lock, { force: true }); continue; }
      if (Date.now() - t0 > waitMs) throw new Error('Perfil do navegador ocupado por outro processo (auth/profile.lock).');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function launch(storageStatePath, { headful = false } = {}) {
  const { chromium } = await import('playwright');
  const p = paths(storageStatePath);
  const release = await acquireLock(p.lock);
  const fresh = !fs.existsSync(path.join(p.profile, 'Default'));
  const opts = { headless: !headful, channel: 'chromium', viewport: { width: 1280, height: 900 } };
  if (!headful && fs.existsSync(p.ua)) opts.userAgent = JSON.parse(fs.readFileSync(p.ua, 'utf8')).userAgent;
  let context;
  try {
    context = await chromium.launchPersistentContext(p.profile, opts);
    if (!opts.userAgent && !headful) {
      // Sem UA gravado no login: usa o do próprio binário, sem a marca "Headless".
      const ua = (await context.newPage().then((pg) => pg.evaluate(() => navigator.userAgent))).replace('HeadlessChrome', 'Chrome');
      await context.close();
      context = await chromium.launchPersistentContext(p.profile, { ...opts, userAgent: ua });
    }
    if (fresh && fs.existsSync(storageStatePath)) {
      // Migração: perfil novo herda os cookies da sessão salva no formato antigo.
      const st = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
      await context.addCookies(st.cookies || []);
    }
  } catch (e) { release(); throw e; }
  const close = async () => { try { await context.close(); } finally { release(); } };
  return { context, close };
}

// Fluxo de login interativo: abre o navegador (perfil persistente), você loga, e o login termina sozinho
// quando a lista de livros aparece. ENTER também encerra a espera.
export async function login(storageStatePath) {
  const { context, close } = await launch(storageStatePath, { headful: true });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(NOTEBOOK_URL, { waitUntil: 'domcontentloaded' });
    console.log('\n>>> Faça login na Amazon na janela do navegador (marque "Manter conectado").');
    console.log('>>> A janela fecha sozinha quando a lista de livros aparecer.\n');
    const ok = await Promise.race([
      page.waitForSelector(LIB_SEL, { timeout: 15 * 60 * 1000 }).then(() => true).catch(() => false),
      waitForEnter().then(() => page.locator(LIB_SEL).count().then((n) => n > 0)),
    ]);
    if (!ok) throw new Error('Login não concluído: a lista de livros não apareceu.');
    await page.waitForTimeout(3000); // deixa a Amazon terminar de gravar cookies/localStorage
    const userAgent = await page.evaluate(() => navigator.userAgent);
    fs.writeFileSync(paths(storageStatePath).ua, JSON.stringify({ userAgent, saved: new Date().toISOString() }, null, 2));
    await context.storageState({ path: storageStatePath });
    console.log('Sessão salva no perfil persistente (auth/profile).');
  } finally {
    await close();
    process.stdin.pause();
  }
}

// Sonda: abre o Notebook e diz se a sessão vale. Só leitura (não mexe na library).
// -> { ok, url, books, signin, password } ; password = Amazon pedindo só a senha de novo (reautenticação).
export async function checkSession(storageStatePath) {
  if (!fs.existsSync(paths(storageStatePath).profile) && !fs.existsSync(storageStatePath)) {
    return { ok: false, url: null, books: 0, signin: false, password: false, reason: 'sem sessão' };
  }
  const { context, close } = await launch(storageStatePath);
  try {
    const page = await context.newPage();
    await page.goto(NOTEBOOK_URL, { waitUntil: 'domcontentloaded' });
    const ok = await page.waitForSelector(LIB_SEL, { timeout: 20000 }).then(() => true).catch(() => false);
    const r = {
      ok,
      url: page.url().split('?')[0],
      books: await page.locator(LIB_SEL).count(),
      signin: (await page.locator('form[name="signIn"], #ap_email, input[name="email"]').count()) > 0,
      password: (await page.locator('#ap_password').count()) > 0,
    };
    if (ok) await context.storageState({ path: storageStatePath });
    return r;
  } finally {
    await close();
  }
}

// Extrai todos os livros + destaques. Retorna array de
// { asin, title, author, highlights: [{loc, text, note, kdate}] }.
export async function scrapeAll(storageStatePath, { headful = false, debug = false } = {}) {
  if (!fs.existsSync(paths(storageStatePath).profile) && !fs.existsSync(storageStatePath)) {
    throw new Error(`Sessão não encontrada (${storageStatePath}). Rode: kindle login`);
  }
  const { context, close } = await launch(storageStatePath, { headful });
  try {
    const page = await context.newPage();
    await page.goto(NOTEBOOK_URL, { waitUntil: 'domcontentloaded' });

    const libSel = LIB_SEL;
    await page.waitForSelector(libSel, { timeout: 20000 }).catch(() => {
      throw new Error('Não achei a lista de livros. Sessão expirou? Rode: kindle login');
    });

    // Cópia da sessão no formato antigo (backup / migração de perfil).
    await context.storageState({ path: storageStatePath });

    const books = await page.$$eval(libSel, (els) =>
      els.map((el) => {
        // O id do elemento da biblioteca É o ASIN.
        const asin = el.id || el.getAttribute('data-asin') || '';
        const title = el.querySelector('h2')?.textContent?.trim() || '';
        const author = (el.querySelector('p')?.textContent || '')
          .replace(/^By:\s*/i, '').trim();
        return { asin, title, author };
      }).filter((b) => b.asin && b.title)
    );

    if (debug) console.log(`Livros encontrados: ${books.length}`);

    const result = [];
    for (const b of books) {
      const highlights = await scrapeBook(page, b.asin);
      result.push({ ...b, highlights });
      if (debug) console.log(`  [${highlights.length}] ${b.title}`);
    }
    return result;
  } finally {
    await close();
  }
}

async function scrapeBook(page, asin) {
  // Selecionar o livro dispara o carregamento AJAX das anotações no painel direito.
  // (Navegar por ?asin= NÃO popula o painel — precisa ser o clique.)
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    (el?.querySelector('a') || el)?.click();
  }, asin);

  // Espera o painel refletir este livro (ou um estado vazio) e carrega tudo via scroll.
  await page.waitForTimeout(1200);
  await loadAllAnnotations(page);

  return await page.evaluate(() => {
    // Âncora confiável: um <input id="kp-annotation-location"> por destaque.
    const inputs = [...document.querySelectorAll('input[id="kp-annotation-location"]')];
    const out = [];
    for (const inp of inputs) {
      // Sobe até o container da anotação (o primeiro ancestral que contém o texto).
      let c = inp.parentElement;
      while (c && !c.querySelector('[id="highlight"]')) c = c.parentElement;
      if (!c) continue;

      const text = (c.querySelector('[id="highlight"]')?.textContent || '').trim();
      if (!text) continue; // nota órfã, sem destaque associado

      const note = (c.querySelector('[id="note"]')?.textContent || '').trim() || null;
      const loc = Number(String(inp.value).replace(/[.,]/g, ''));
      if (!Number.isFinite(loc)) continue;
      out.push({ loc, text, note, kdate: null });
    }
    return out;
  });
}

// O Notebook carrega os destaques por scroll infinito; rola até estabilizar.
async function loadAllAnnotations(page) {
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.locator('input[id="kp-annotation-location"]').count();
    if (n === prev) break;
    prev = n;
    await page.evaluate(() => {
      const pane = document.querySelector('#kp-notebook-annotations') || document.body;
      pane.scrollTop = pane.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(700);
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
  });
}
