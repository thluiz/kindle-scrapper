// Parse e render dos arquivos Markdown por livro.
// O Markdown É a fonte da verdade. Cada destaque carrega um marcador invisível:
//   <!-- kh loc=1234 added=2026-07-13 -->
// - loc   = localização Kindle (estável por livro) → chave de deduplicação
// - added = data em que o scraper viu o destaque pela primeira vez → índice de recência

export function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sem-titulo';
}

// Extrai o mapa loc -> added de um conteúdo existente, para preservar a data
// original de "descoberta" quando um livro é re-sincronizado.
export function parseAddedMap(content) {
  const map = {};
  if (!content) return map;
  const re = /<!--\s*kh\s+loc=(\d+)\s+added=([\d-]+)\s*-->/g;
  let m;
  while ((m = re.exec(content))) map[m[1]] = m[2];
  return map;
}

// Parser completo: devolve { frontmatter, highlights: [{loc,text,note,kdate,added}] }.
// Usado pela CLI de query (recent/book).
export function parseBook(content) {
  const fm = {};
  let body = content;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2];
    }
    body = content.slice(fmMatch[0].length);
  }

  const highlights = [];
  const lines = body.split('\n');
  let quote = [];
  for (const line of lines) {
    const marker = line.match(/^<!--\s*kh\s+loc=(\d+)\s+added=([\d-]+)\s*-->/);
    if (marker) {
      const h = finalizeBlock(quote);
      if (h) { h.loc = Number(marker[1]); h.added = marker[2]; highlights.push(h); }
      quote = [];
      continue;
    }
    if (line.startsWith('>')) quote.push(line.replace(/^>\s?/, ''));
    else if (line.trim() === '') { /* separador entre blocos */ }
  }
  return { frontmatter: fm, highlights };
}

function finalizeBlock(quoteLines) {
  if (!quoteLines.length) return null;
  let kdate = null, note = null;
  const textLines = [];
  for (const l of quoteLines) {
    const meta = l.match(/^—\s*loc\.\s*\d+(?:\s*·\s*(.*))?$/);
    if (meta) { kdate = (meta[1] || '').trim() || null; continue; }
    if (l.startsWith('📝')) { note = l.replace(/^📝\s*/, '').trim(); continue; }
    textLines.push(l);
  }
  const text = textLines.join('\n').trim();
  if (!text) return null;
  return { text, note, kdate };
}

// Renderiza um livro inteiro a partir da lista de destaques (sempre reescreve o
// arquivo completo → determinístico e idempotente).
export function renderBook(book, today) {
  const hs = [...book.highlights].sort((a, b) => a.loc - b.loc);
  const fm = [
    '---',
    `title: ${escapeFm(book.title)}`,
    `author: ${escapeFm(book.author || '')}`,
    `asin: ${book.asin || ''}`,
    `highlights: ${hs.length}`,
    `updated: ${today}`,
    '---',
    '',
  ].join('\n');

  const blocks = hs.map((h) => {
    const out = [];
    for (const line of String(h.text).split('\n')) out.push(`> ${line}`);
    const metaBits = [`loc. ${h.loc}`];
    if (h.kdate) metaBits.push(h.kdate);
    out.push(`> — ${metaBits.join(' · ')}`);
    if (h.note) out.push(`> 📝 ${h.note}`);
    out.push(`<!-- kh loc=${h.loc} added=${h.added || today} -->`);
    return out.join('\n');
  });

  return fm + `# ${book.title}\n` + (book.author ? `*${book.author}*\n` : '') + '\n' + blocks.join('\n\n') + '\n';
}

function escapeFm(v) {
  const s = String(v);
  return /[:#]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}
