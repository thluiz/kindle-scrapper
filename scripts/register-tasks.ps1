#Requires -Version 7
# Registra as tasks do kindle-scrapper no Hermes-PT, todas ocultas (via hidden.vbs, sem console na tela):
#   \Claude\KindleDaily  00:00  sync -> commit/push da library -> post-sync.local.ps1 (import do Scholion)
#   \Claude\KindleProbe  de hora em hora (:30)  sonda headless da sessão; avisa quando cai
# A antiga \Claude\KindleImport (04:00) fica desativada: o import agora é encadeado no sync.
$vbs = Join-Path $PSScriptRoot 'hidden.vbs'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
  -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`" daily-sync.ps1"
$t = New-ScheduledTaskTrigger -Daily -At 00:00
Register-ScheduledTask -TaskPath '\Claude\' -TaskName 'KindleDaily' -Action $a -Trigger $t -Settings $settings -Force | Out-Null

$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`" probe.ps1"
$t = New-ScheduledTaskTrigger -Once -At (Get-Date -Minute 30 -Second 0) -RepetitionInterval (New-TimeSpan -Hours 1)
$ps = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskPath '\Claude\' -TaskName 'KindleProbe' -Action $a -Trigger $t -Settings $ps -Force | Out-Null

if (Get-ScheduledTask -TaskPath '\Claude\' -TaskName 'KindleImport' -ErrorAction SilentlyContinue) {
  Disable-ScheduledTask -TaskPath '\Claude\' -TaskName 'KindleImport' | Out-Null
}
Get-ScheduledTask -TaskPath '\Claude\' | Where-Object TaskName -like 'Kindle*' |
  ForEach-Object { '{0,-14} {1,-9} {2} {3}' -f $_.TaskName, $_.State, $_.Actions[0].Execute, $_.Actions[0].Arguments }
