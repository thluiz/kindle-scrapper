# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Planejado
- Skill/script `kindle-to-scholion`: publica quotes de `recent` como notas de citação.
- Tarefa agendada de resumo diário via GossipGate (destaque do dia).
- Captura da data original do destaque (`kdate`) direto do Notebook.
- Exportação incremental "desde o último commit".

## [0.1.0] - 2026-07-13

Primeira versão. Núcleo funcional: scrape → merge idempotente → Markdown → query.

### Adicionado
- **Scraper do Kindle Notebook** (`src/scrape.js`) via Playwright, com login
  interativo (2FA) e sessão persistida em `auth/storageState.json`.
- **Merge idempotente** (`src/merge.js`): um arquivo por livro, deduplicação pela
  `location` do Kindle; destaques existentes são atualizados no lugar.
- **Guarda de segurança**: um scrape vazio nunca sobrescreve um arquivo já existente.
- **Camada de query** (`src/query.js`): `recent` (por dias, via campo `added`),
  `list` e `book`, com saída em Markdown ou JSON.
- **Parser/render de Markdown** (`src/md.js`) com marcador invisível
  `<!-- kh loc=... added=... -->` como chave de deduplicação; suporte a destaques
  multi-linha e notas manuais.
- **CLI** (`bin/kindle.js`): `login`, `sync`, `recent`, `book`, `list`.
- **Teste de fumaça** (`test-smoke.mjs`) cobrindo idempotência, detecção de
  "sem mudança" e a guarda contra scrape vazio.
- README, `.gitignore` (cookies fora do versionamento) e `package.json`.

[Não lançado]: https://github.com/thluiz/kindle-scrapper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thluiz/kindle-scrapper/releases/tag/v0.1.0
