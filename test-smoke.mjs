import { mergeBook } from './src/merge.js';
import { recent, renderRecentMd, loadLibrary } from './src/query.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LIB = path.join(os.tmpdir(), 'kh_lib_test');
fs.rmSync(LIB, { recursive: true, force: true });

const base = {
  loc: 120, text: 'Primeira ideia marcada.', note: null, kdate: '05/01/2026',
};
const two = { loc: 340, text: 'Segunda ideia.\nEm duas linhas.', note: 'minha nota', kdate: '06/01/2026' };
const three = { loc: 512, text: 'Terceira, nova.', note: null, kdate: '07/01/2026' };

let r = mergeBook(LIB, { asin: 'B001', title: 'Ação e Reação', author: 'Fulano', highlights: [base, two] });
console.log('SYNC1:', r.added, 'novos,', r.total, 'total');

r = mergeBook(LIB, { asin: 'B001', title: 'Ação e Reação', author: 'Fulano', highlights: [base, two, three] });
console.log('SYNC2:', r.added, 'novos,', r.total, 'total (esperado 1 novo, 3 total)');

r = mergeBook(LIB, { asin: 'B001', title: 'Ação e Reação', author: 'Fulano', highlights: [base, two, three] });
console.log('SYNC3 nochange:', !!r.nochange);

r = mergeBook(LIB, { asin: 'B001', title: 'Ação e Reação', author: 'Fulano', highlights: [] });
console.log('GUARDA scrape vazio -> skipped:', r.skipped);

console.log('\n--- Arquivo gerado ---');
console.log(fs.readFileSync(path.join(LIB, 'acao-e-reacao.md'), 'utf8'));

console.log('--- list ---');
console.log(loadLibrary(LIB).map((b) => `${b.highlights.length} ${b.title}`).join('\n'));

console.log('\n--- recent (markdown) ---');
console.log(renderRecentMd(recent(LIB, 3650)));
