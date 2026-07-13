#!/usr/bin/env node
// CLI do kindle-scrapper.
//   kindle login                    → login interativo na Amazon (salva sessão)
//   kindle sync [--headful] [--debug] → baixa/atualiza os .md por livro
//   kindle recent [--since 7d] [--json]
//   kindle book "Título" [--json]
//   kindle list
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, scrapeAll } from '../src/scrape.js';
import { mergeBook } from '../src/merge.js';
import { loadLibrary, recent, renderRecentMd } from '../src/query.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const LIBRARY = path.join(ROOT, 'library');
const STATE = path.join(ROOT, 'auth', 'storageState.json');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

function parseSince(s) {
  const m = String(s).match(/^(\d+)([dwh]?)$/);
  if (!m) return 7;
  const n = Number(m[1]);
  return m[2] === 'w' ? n * 7 : m[2] === 'h' ? n / 24 : n;
}

async function main() {
  switch (cmd) {
    case 'login':
      await login(STATE);
      break;

    case 'sync': {
      const books = await scrapeAll(STATE, { headful: flag('headful'), debug: flag('debug') });
      let totNew = 0, totUpd = 0, files = 0;
      for (const b of books) {
        const r = mergeBook(LIBRARY, b);
        if (r.skipped) { console.warn(`! ${b.title}: scrape vazio — mantido intacto`); continue; }
        if (r.nochange) continue;
        files++; totNew += r.added; totUpd += r.updated;
        console.log(`✓ ${path.basename(r.file)}  (+${r.added} novos, ${r.total} total)`);
      }
      console.log(`\nSync: ${files} arquivos alterados · ${totNew} destaques novos · ${books.length} livros vistos`);
      console.log(`Dica: commite a pasta library/ para guardar o histórico.`);
      break;
    }

    case 'recent': {
      const days = parseSince(opt('since', '7d'));
      const items = recent(LIBRARY, days);
      if (flag('json')) console.log(JSON.stringify(items, null, 2));
      else process.stdout.write(renderRecentMd(items));
      break;
    }

    case 'book': {
      const q = (argv[1] || '').toLowerCase();
      const hit = loadLibrary(LIBRARY).find(
        (b) => b.title.toLowerCase().includes(q) || b.slug.includes(q)
      );
      if (!hit) { console.error('Livro não encontrado.'); process.exit(1); }
      if (flag('json')) console.log(JSON.stringify(hit, null, 2));
      else {
        console.log(`# ${hit.title}${hit.author ? ` — ${hit.author}` : ''}  (${hit.highlights.length})`);
        for (const h of hit.highlights) console.log(`\n> ${h.text}\n— loc. ${h.loc}${h.note ? `\n📝 ${h.note}` : ''}`);
      }
      break;
    }

    case 'list': {
      const books = loadLibrary(LIBRARY);
      for (const b of books) console.log(`${String(b.highlights.length).padStart(4)}  ${b.title}${b.author ? ` — ${b.author}` : ''}`);
      console.log(`\n${books.length} livros · ${books.reduce((n, b) => n + b.highlights.length, 0)} destaques`);
      break;
    }

    default:
      console.log('Uso: kindle <login|sync|recent|book|list> [opções]');
      console.log('  sync   [--headful] [--debug]');
      console.log('  recent [--since 7d] [--json]');
      console.log('  book   "Título" [--json]');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
