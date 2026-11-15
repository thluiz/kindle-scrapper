#Requires -Version 7
# Sonda horária da sessão da Amazon (task \Claude\KindleProbe). Headless, só leitura: não mexe na library.
# Cada execução vira uma linha em session-probe.log; quando a sessão passa de válida a expirada, avisa uma
# vez via GossipGate dizendo quanto ela durou e que tipo de tela a Amazon mostrou. Abrir o Notebook a cada
# hora também pode ajudar a manter a sessão viva.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $fnm = Get-Command fnm -ErrorAction SilentlyContinue
  if ($fnm) { & $fnm.Source env --use-on-cd | Out-String | Invoke-Expression }
}
$logFile = Join-Path $repo 'session-probe.log'
$stateFile = Join-Path $repo 'auth\probe-state.json'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Encoding UTF8 $logFile }
function Notify($msg) {
  try {
    $key = (Get-Content 'C:\Users\conta\.gossipgate\api-key' -Raw).Trim()
    $body = @{ message = $msg } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri 'http://localhost:8080/api/gossip-gate/send' -Method Post `
      -Headers @{ 'X-Api-Key' = $key } -ContentType 'application/json' -Body $body | Out-Null
  } catch { Log "Falha ao notificar: $($_.Exception.Message)" }
}

$state = if (Test-Path $stateFile) { Get-Content -Raw $stateFile | ConvertFrom-Json -AsHashtable } else { @{} }
$out = (& node bin/kindle.js check 2>&1 | Out-String).Trim()
$code = $LASTEXITCODE
$now = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
Log "exit=$code $out"

if ($code -eq 0) {
  if (-not $state.firstOk -or $state.expired) { $state.firstOk = $now }
  $state.lastOk = $now; $state.expired = $false
} elseif ($code -eq 3) {
  if (-not $state.expired) {
    $tela = if ($out -match '"password":true') { 'só pediu a senha de novo (reautenticação)' }
            elseif ($out -match '"signin":true') { 'pediu login completo' } else { 'tela desconhecida' }
    Notify ("⚠️ Kindle: a sessão da Amazon caiu. Válida de $($state.firstOk) até pelo menos $($state.lastOk); " +
      "a Amazon $tela. Para logar e já importar: E:\kindle-scrapper\login.cmd")
    $state.expired = $true; $state.expiredAt = $now
  }
} else {
  Log 'sonda falhou (não é sessão expirada); nada a avisar'
}
$state | ConvertTo-Json | Set-Content -Encoding UTF8 $stateFile
