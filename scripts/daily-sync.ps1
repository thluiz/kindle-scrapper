#Requires -Version 7
# Sync diário dos destaques do Kindle + commit/push no git.
# Registrado como task \Claude\KindleDaily. Notifica via GossipGate.
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.Encoding]::UTF8
# Sem isto o pwsh decodifica o stdout do node na codepage do console
# (Não → N├úo) e a detecção de sessão expirada nunca casava.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = 'E:\kindle-scrapper'
Set-Location $repo

# O node é gerenciado pelo fnm, que injeta o PATH via hook do profile.
# A task roda com -NoProfile, então o node não fica disponível. Inicializa
# o env do fnm manualmente aqui (fnm está no PATH persistente do usuário).
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $fnm = Get-Command fnm -ErrorAction SilentlyContinue
  if ($fnm) { & $fnm.Source env --use-on-cd | Out-String | Invoke-Expression }
}

$logFile = Join-Path $repo 'daily-sync.log'
function Log($m) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Tee-Object -FilePath $logFile -Append | Out-Null
}
function Notify($msg) {
  try {
    $key = (Get-Content 'C:\Users\conta\.gossipgate\api-key' -Raw).Trim()
    $body = @{ message = $msg } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri 'http://localhost:8080/api/gossip-gate/send' -Method Post `
      -Headers @{ 'X-Api-Key' = $key } -ContentType 'application/json' -Body $body | Out-Null
  } catch { Log "Falha ao notificar: $($_.Exception.Message)" }
}

try {
  Log '=== Iniciando sync ==='
  $out = (& node bin/kindle.js sync 2>&1 | Out-String)
  $nodeExit = $LASTEXITCODE
  Log $out

  # Sessão da Amazon expirou? Avisa e sai — precisa de login interativo.
  # Regex só com ASCII para não depender de encoding.
  if ($out -match 'encontrada|expirou|achei a lista|kindle login') {
    Notify "⚠️ Kindle: sessão da Amazon expirou. Para logar e já sincronizar/importar: E:\kindle-scrapper\login.cmd"
    Log 'Sessão expirou — abortando.'
    exit 1
  }
  # Qualquer outra falha do node também precisa avisar, nunca cair em "sem novidades".
  if ($nodeExit -ne 0) {
    $last = ($out.Trim() -split "`n" | Select-Object -Last 1)
    Notify "❌ Kindle sync falhou (exit $nodeExit): $last"
    Log "node saiu com $nodeExit — abortando."
    exit 1
  }

  # Só comita se a library mudou.
  & git add library 2>&1 | Out-Null
  & git diff --cached --quiet -- library
  if ($LASTEXITCODE -eq 0) {
    Log 'Sem novidades — nada a commitar.'
  } else {
    $summary = ($out -split "`n" | Where-Object { $_ -match '^Sync:' } | Select-Object -First 1).Trim()
    $date = Get-Date -Format 'yyyy-MM-dd'
    & git -c user.name='Claude' -c user.email='claude@thluiz.com' commit -q -m "sync $date"
    $push = (& git push origin main 2>&1 | Out-String)
    Log $push
    Notify "📖 Kindle sync ($date): $summary — publicado no git."
    Log 'OK.'
  }
} catch {
  Log "ERRO: $($_.Exception.Message)"
  Notify "❌ Kindle sync falhou: $($_.Exception.Message)"
  exit 1
}

# Pós-sync (só chega aqui com sync bem-sucedido): hook local, fora do git, que encadeia o consumidor
# da library. No Hermes-PT, chama o import do Scholion. Roda mesmo sem novidades: retoma import que
# tenha falhado antes. Falha do hook não muda o resultado do sync; o próprio hook avisa.
$hook = Join-Path $PSScriptRoot 'post-sync.local.ps1'
if (Test-Path $hook) {
  Log 'Pós-sync: post-sync.local.ps1'
  try { & $hook } catch { Log "Pós-sync falhou: $($_.Exception.Message)" }
}
exit 0
