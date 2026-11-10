// Diagnóstico: abre o Notebook com a sessão salva e reporta onde caiu.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: 'auth/storageState.json' });
const page = await context.newPage();
await page.goto('https://read.amazon.com/notebook', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
console.log('URL final :', page.url());
console.log('Título    :', await page.title());
console.log('Livros (.kp-notebook-library-each-book):', await page.locator('.kp-notebook-library-each-book').count());
console.log('Form login (#ap_email / signin):', await page.locator('#ap_email, input[name="email"], form[name="signIn"]').count());
await page.screenshot({ path: 'debug/diagnose.png', fullPage: false });
await (await import('node:fs')).promises.writeFile('debug/diagnose.html', await page.content());
await browser.close();
