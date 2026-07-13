# kindle-scrapper

> Baixa as marcações dos seus livros Kindle para **Markdown versionado** — um
> arquivo por livro, sem duplicar. Uma alternativa livre e *future-proof* ao Readwise.

Repositório: <https://github.com/thluiz/kindle-scrapper>

O Readwise não faz mágica: ele lê a mesma fonte que você mesmo pode ler — a página
**Kindle Notebook** (`read.amazon.com/notebook`), onde todos os seus destaques ficam
sincronizados na nuvem. Este projeto automatiza essa leitura com [Playwright](https://playwright.dev),
usando a **sua própria sessão**, e grava tudo em Markdown limpo que é seu para
sempre.

## Por que Markdown + git

- **Um arquivo por livro** (`library/<slug>.md`). Re-sincronizar nunca cria arquivo
  novo nem duplica destaque.
- **Chave de deduplicação = `location`** do Kindle (estável por livro). Marque o mesmo
  livro quantas vezes quiser: só os destaques novos entram; os já existentes são
  atualizados no lugar.
- **`git log` é o histórico.** Cada `sync` vira um commit; o diff mostra exatamente o
  que entrou.
- **Campo `added=`** em cada destaque = data em que o scraper o viu pela primeira vez
  → base para "quotes recentes", sem banco de dados paralelo para dessincronizar.

```
read.amazon.com/notebook  (Playwright · sua sessão)
        │  extrai destaques de cada livro
        ▼
   merge idempotente por location  ──►  library/<slug>.md   (git = histórico)
        │
        ▼
   kindle recent --since 7d  ──►  Scholion · resumo diário · qualquer coisa
```

## Instalação

```bash
git clone https://github.com/thluiz/kindle-scrapper
cd kindle-scrapper
npm install
npx playwright install chromium
```

## Uso

```bash
# 1. Login (uma vez) — abre o browser; logue na Amazon, incluindo 2FA.
#    A sessão é salva em auth/storageState.json (gitignored) e reusada depois.
node bin/kindle.js login

# 2. Sincronizar — baixa/atualiza todos os livros.
node bin/kindle.js sync
node bin/kindle.js sync --headful --debug   # 1ª vez / para depurar seletores

# 3. Extrair.
node bin/kindle.js list                     # inventário
node bin/kindle.js recent --since 7d         # destaques novos da semana (Markdown)
node bin/kindle.js recent --since 1d --json  # para resumo diário / IA
node bin/kindle.js book "Nome do Livro"      # dump de um livro
```

Há atalhos em `npm run` (`sync`, `login`, `recent`, `list`).

## Comandos

| Comando | Descrição |
|---|---|
| `login` | Login interativo na Amazon; salva a sessão. |
| `sync [--headful] [--debug]` | Baixa/atualiza os `.md` por livro. |
| `recent [--since 7d] [--json]` | Destaques adicionados no período (por `added`). |
| `book "Título" [--json]` | Dump de um livro. |
| `list` | Inventário: nº de destaques por livro. |

`--since` aceita `Nd` (dias), `Nw` (semanas) ou `Nh` (horas).

## Formato de um destaque

```markdown
> O texto marcado no livro.
> — loc. 1234 · 05/01/2026
> 📝 minha nota manual
<!-- kh loc=1234 added=2026-07-13 -->
```

O comentário `<!-- kh ... -->` é invisível no Obsidian e em qualquer render de
Markdown — é ele que garante a deduplicação entre sincronizações.

## Histórico via git

```bash
git add library && git commit -m "sync $(date +%F)"
```

`auth/storageState.json` (cookies da sua sessão) está no `.gitignore` e **nunca** é
versionado.

## Integrações

- **Scholion / Obsidian:** `kindle recent --since 7d --json` alimenta um script que
  cria notas de citação.
- **Resumo diário:** uma tarefa agendada roda `kindle recent --since 1d --json` e
  envia o destaque do dia (estilo *spaced repetition* do Readwise).

## Quando a Amazon muda o DOM

A estrutura do Notebook muda de tempos em tempos. Se um `sync` voltar 0 livros ou 0
destaques, rode `kindle sync --headful --debug` e ajuste os seletores marcados com
`[SEL]` em [`src/scrape.js`](src/scrape.js). Uma guarda de segurança impede que um
scrape vazio apague arquivos já existentes.

## Aviso legal

Ferramenta para uso pessoal sobre os **seus próprios** dados, autenticada com a
**sua** sessão. Não faz brute-force de login nem contorna proteções. Respeite os
Termos de Serviço da Amazon e use com moderação (rate baixo).

## Licença

MIT.
