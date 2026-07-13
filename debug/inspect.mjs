// Inspeciona o DOM real do Kindle Notebook para acertar os seletores.
// Read-only: não escreve nada na library. Uso: node debug/inspect.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const STATE = path.join(ROOT, 'auth', 'storageState.json');
const OUT = path.join(ROOT, 'debug', 'dump.html');
const NB = 'https://read.amazon.com/notebook';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

await page.goto(NB, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.kp-notebook-library-each-book', { timeout: 20000 });

const first = await page.$eval('.kp-notebook-library-each-book', (el) => ({
  id: el.id,
  asin: el.getAttribute('data-asin'),
  title: el.querySelector('h2')?.textContent?.trim(),
}));
console.log('Primeiro livro:', JSON.stringify(first));

// Clica no livro (em vez de navegar por ?asin=) para disparar o carregamento AJAX.
await page.evaluate((id) => {
  const el = document.getElementById(id);
  (el?.querySelector('a') || el)?.click();
}, first.id);
await page.waitForTimeout(3500);

// Diagnóstico de contagem por candidato de seletor.
const counts = await page.evaluate(() => {
  const sels = [
    '#kp-notebook-annotations',
    '.kp-notebook-annotation-container',
    '.kp-notebook-row-separator',
    '.a-row.a-spacing-base',
    '#highlight',
    '.kp-notebook-highlight',
    '#note',
    '.kp-notebook-note',
    '#annotationHighlightHeader',
    '[id^="highlight-"]',
    '.kp-annotation',
    'span[id="highlight"]',
  ];
  const out = {};
  for (const s of sels) out[s] = document.querySelectorAll(s).length;
  return out;
});
console.log('\nContagens por seletor:');
for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(4)}  ${k}`);

// Salva o HTML do container de anotações (ou do body) para leitura.
const html = await page.evaluate(() => {
  const c = document.querySelector('#kp-notebook-annotations')
        || document.querySelector('#annotations')
        || document.querySelector('#kp-notebook-annotations-pane')
        || document.body;
  return c ? c.outerHTML : '(vazio)';
});
fs.writeFileSync(OUT, html, 'utf8');
console.log(`\nHTML das anotações salvo em ${OUT} (${html.length} chars)`);

await browser.close();
