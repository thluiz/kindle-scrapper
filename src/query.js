// Camada de extração: varre os .md da library e devolve destaques filtrados.
// Parseia o próprio Markdown (sem índice paralelo → nada dessincroniza).
import fs from 'node:fs';
import path from 'node:path';
import { parseBook } from './md.js';

export function loadLibrary(libraryDir) {
  if (!fs.existsSync(libraryDir)) return [];
  const files = fs.readdirSync(libraryDir).filter((f) => f.endsWith('.md'));
  const books = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(libraryDir, f), 'utf8');
    const { frontmatter, highlights } = parseBook(content);
    books.push({
      slug: f.replace(/\.md$/, ''),
      title: frontmatter.title?.replace(/^"|"$/g, '') || f,
      author: frontmatter.author?.replace(/^"|"$/g, '') || '',
      asin: frontmatter.asin || '',
      highlights,
    });
  }
  return books;
}

// Destaques adicionados nos últimos N dias (por padrão pelo campo `added`).
export function recent(libraryDir, sinceDays) {
  const cutoff = new Date(Date.now() - sinceDays * 86400000)
    .toISOString().slice(0, 10);
  const out = [];
  for (const book of loadLibrary(libraryDir)) {
    for (const h of book.highlights) {
      if ((h.added || '') >= cutoff) {
        out.push({ book: book.title, author: book.author, ...h });
      }
    }
  }
  out.sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : a.loc - b.loc));
  return out;
}

export function renderRecentMd(items) {
  if (!items.length) return '_Nenhum destaque no período._\n';
  const byBook = {};
  for (const it of items) (byBook[it.book] ||= []).push(it);
  const parts = [];
  for (const [book, hs] of Object.entries(byBook)) {
    parts.push(`## ${book}${hs[0].author ? ` — ${hs[0].author}` : ''}`);
    for (const h of hs) {
      parts.push(`> ${h.text.replace(/\n/g, '\n> ')}`);
      const meta = [`loc. ${h.loc}`, h.added];
      parts.push(`— ${meta.filter(Boolean).join(' · ')}`);
      if (h.note) parts.push(`📝 ${h.note}`);
      parts.push('');
    }
  }
  return parts.join('\n');
}
