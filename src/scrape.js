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

export async function launch(storageStatePath, { headful = false } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !headful });
  const hasState = fs.existsSync(storageStatePath);
  const context = await browser.newContext(
    hasState ? { storageState: storageStatePath } : {}
  );
  return { browser, context };
}

// Fluxo de login interativo: abre o browser, você loga, salvamos o cookie.
export async function login(storageStatePath) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(NOTEBOOK_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n>>> Faça login na Amazon na janela do browser (incluindo 2FA).');
  console.log('>>> Quando a lista de livros do Notebook aparecer, volte aqui e pressione ENTER.\n');
  await waitForEnter();

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
  console.log(`Sessão salva em ${storageStatePath}`);
  await browser.close();
}

// Extrai todos os livros + destaques. Retorna array de
// { asin, title, author, highlights: [{loc, text, note, kdate}] }.
export async function scrapeAll(storageStatePath, { headful = false, debug = false } = {}) {
  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Sessão não encontrada (${storageStatePath}). Rode: kindle login`);
  }
  const { browser, context } = await launch(storageStatePath, { headful });
  try {
    const page = await context.newPage();
    await page.goto(NOTEBOOK_URL, { waitUntil: 'domcontentloaded' });

    // [SEL] lista de livros na coluna esquerda
    const libSel = '.kp-notebook-library-each-book';
    await page.waitForSelector(libSel, { timeout: 20000 }).catch(() => {
      throw new Error('Não achei a lista de livros. Sessão expirou? Rode: kindle login');
    });

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
    await browser.close();
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
