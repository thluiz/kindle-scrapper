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
      const highlights = await scrapeBook(page, b.asin, debug);
      result.push({ ...b, highlights });
      if (debug) console.log(`  ${b.title}: ${highlights.length} destaques`);
    }
    return result;
  } finally {
    await browser.close();
  }
}

async function scrapeBook(page, asin, debug) {
  // Carrega os destaques de um livro específico. O Notebook aceita ?asin= direto.
  await page.goto(`${NOTEBOOK_URL}?asin=${encodeURIComponent(asin)}&contentLimitState=&`, {
    waitUntil: 'domcontentloaded',
  });
  // [SEL] container das anotações
  await page.waitForSelector('#kp-notebook-annotations, .kp-notebook-annotation-container', { timeout: 15000 }).catch(() => {});

  return await page.$$eval('.kp-notebook-highlight, #highlight', (nodes) => {
    // Cada destaque vive num "row"; subimos até o container e lemos header/nota.
    const seen = new Set();
    const out = [];
    for (const hlNode of nodes) {
      const row = hlNode.closest('.a-row, .kp-notebook-annotation-container') || hlNode.parentElement;
      if (!row || seen.has(row)) continue;
      seen.add(row);

      const text = (row.querySelector('#highlight, .kp-notebook-highlight')?.textContent || '').trim();
      if (!text) continue;

      const header = (row.querySelector('#annotationHighlightHeader, .kp-notebook-annotation-header')?.textContent || '');
      const locMatch = header.match(/(?:Location|Localização|Página|Page)[:\s]*([\d.,]+)/i);
      const loc = locMatch ? Number(locMatch[1].replace(/[.,]/g, '')) : null;

      const note = (row.querySelector('#note, .kp-notebook-note')?.textContent || '').trim() || null;

      if (loc == null) continue; // sem location não há chave estável → ignora
      out.push({ loc, text, note, kdate: null });
    }
    return out;
  });
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
  });
}
