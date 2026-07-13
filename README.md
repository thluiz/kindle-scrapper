# kindle-scrapper

Baixa as marcações dos seus livros Kindle (a partir de `read.amazon.com/notebook`)
para **Markdown versionado**, um arquivo por livro, **sem duplicar**. Alternativa
livre ao Readwise.

## Como funciona

```
read.amazon.com/notebook  (Playwright, sua sessão)
        │  extrai destaques de cada livro
        ▼
   merge idempotente por `location`  ──► library/<slug>.md  (git = histórico)
```

- **Um arquivo por livro.** Re-sincronizar nunca cria arquivo novo nem duplica destaque.
- **Chave de dedupe = `location`** do Kindle (estável por livro). Se você marca o
  mesmo livro várias vezes, só os destaques novos entram; os existentes são
  atualizados in-place.
- **`git log` é o histórico.** Cada `sync` = um commit; o diff mostra o que entrou.
- **`added=`** em cada destaque = data da primeira vez que o scraper o viu → base
  para "quotes recentes".

## Setup

```bash
cd E:\kindle-scrapper
npm install
npx playwright install chromium
node bin/kindle.js login     # abre o browser: logue na Amazon (2FA incluso)
```

## Uso

```bash
kindle sync                     # baixa/atualiza tudo
kindle sync --headful --debug   # 1ª vez / debugar seletores

kindle list                     # inventário
kindle recent --since 7d        # destaques novos da semana (Markdown)
kindle recent --since 1d --json # pro resumo diário / IA
kindle book "Nome do Livro"     # dump de um livro
```

## Histórico (git)

```bash
git init && git add -A && git commit -m "sync inicial"
# depois de cada sync:
git add library && git commit -m "sync $(date +%F)"
```

`auth/storageState.json` (cookies) está no `.gitignore` — nunca é versionado.

## Formato de um destaque

```markdown
> O texto marcado no livro.
> — loc. 1234 · 05/01/2026
> 📝 minha nota manual
<!-- kh loc=1234 added=2026-07-13 -->
```

O comentário `<!-- kh ... -->` é invisível no Obsidian/render e é o que garante a
deduplicação.

## Integrações (ideias)

- **Scholion:** `kindle recent --since 7d --json` → alimenta a skill `add-scholion-quote`.
- **Resumo diário no Telegram:** task agendada roda `kindle recent --since 1d --json`
  e manda via GossipGate.

## Nota sobre os seletores

A Amazon muda o DOM do Notebook de tempos em tempos. Se um `sync` voltar 0 livros
ou 0 destaques, rode `kindle sync --headful --debug` e ajuste os seletores marcados
com `[SEL]` em `src/scrape.js`. A guarda de segurança impede que um scrape vazio
apague arquivos já existentes.
