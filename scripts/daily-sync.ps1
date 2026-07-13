#Requires -Version 7
# Sync diário dos destaques do Kindle + commit/push no git.
# Registrado como task \Claude\KindleDaily. Notifica via GossipGate.
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.Encoding]::UTF8
$repo = 'E:\kindle-scrapper'
Set-Location $repo

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
  Log $out

  # Sessão da Amazon expirou? Avisa e sai — precisa de login interativo.
  if ($out -match 'Sess.o n.o encontrada|Sess.o expirou|Não achei a lista') {
    Notify "⚠️ Kindle: sessão da Amazon expirou. Rode ``node bin/kindle.js login`` no Hermes-PT."
    Log 'Sessão expirou — abortando.'
    exit 1
  }

  # Só comita se a library mudou.
  & git add library 2>&1 | Out-Null
  & git diff --cached --quiet -- library
  if ($LASTEXITCODE -eq 0) {
    Log 'Sem novidades — nada a commitar.'
    exit 0
  }

  $summary = ($out -split "`n" | Where-Object { $_ -match '^Sync:' } | Select-Object -First 1).Trim()
  $date = Get-Date -Format 'yyyy-MM-dd'
  & git -c user.name='Claude' -c user.email='claude@thluiz.com' commit -q -m "sync $date"
  $push = (& git push origin main 2>&1 | Out-String)
  Log $push

  Notify "📖 Kindle sync ($date): $summary — publicado no git."
  Log 'OK.'
} catch {
  Log "ERRO: $($_.Exception.Message)"
  Notify "❌ Kindle sync falhou: $($_.Exception.Message)"
  exit 1
}
