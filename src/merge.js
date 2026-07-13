// Merge idempotente: escreve/atualiza um .md por livro sem duplicar destaques.
import fs from 'node:fs';
import path from 'node:path';
import { slugify, parseAddedMap, renderBook } from './md.js';

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// scraped = { asin, title, author, highlights: [{loc, text, note, kdate}] }
// Retorna { file, added, updated, total, skipped }.
export function mergeBook(libraryDir, scraped) {
  const t = today();
  const slug = slugify(scraped.title);
  const file = path.join(libraryDir, `${slug}.md`);

  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

  // Guarda de segurança: se o scrape voltou vazio mas já havia conteúdo,
  // é quase certo que foi falha de scraping — não apagar o histórico.
  if ((!scraped.highlights || scraped.highlights.length === 0) && existing) {
    return { file, added: 0, updated: 0, total: 0, skipped: true };
  }

  const addedMap = parseAddedMap(existing);
  const prevLocs = new Set(Object.keys(addedMap));

  let added = 0, updated = 0;
  const highlights = scraped.highlights.map((h) => {
    const key = String(h.loc);
    if (prevLocs.has(key)) updated++; else added++;
    return { ...h, added: addedMap[key] || t };
  });

  const content = renderBook({ ...scraped, highlights }, t);
  fs.mkdirSync(libraryDir, { recursive: true });

  if (existing === content) {
    return { file, added: 0, updated: 0, total: highlights.length, skipped: false, nochange: true };
  }
  fs.writeFileSync(file, content, 'utf8');
  return { file, added, updated, total: highlights.length, skipped: false };
}
