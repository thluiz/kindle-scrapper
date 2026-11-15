#Requires -Version 7
# Login interativo + coleta imediata: depois do login (passkey/2FA na janela do navegador), roda o
# daily-sync.ps1, que baixa os destaques, comita a library e chama o import (post-sync.local.ps1).
# Assim um login resolve tudo, sem esperar a rotina da noite.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $fnm = Get-Command fnm -ErrorAction SilentlyContinue
  if ($fnm) { & $fnm.Source env --use-on-cd | Out-String | Invoke-Expression }
}
& node bin/kindle.js login
if ($LASTEXITCODE -ne 0) { Write-Host 'Login não concluído; nada foi sincronizado.'; exit 1 }
# A sonda volta a contar a duração a partir deste login.
Remove-Item (Join-Path $repo 'auth\probe-state.json') -ErrorAction SilentlyContinue
Write-Host "`nLogin ok. Sincronizando e importando (pode levar alguns minutos)..."
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'daily-sync.ps1')
Write-Host "Fim (exit $LASTEXITCODE). Log: $repo\daily-sync.log"
