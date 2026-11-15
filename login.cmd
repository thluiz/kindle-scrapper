@echo off
rem Login na Amazon (abre o navegador do perfil persistente) e, em seguida, sync + import.
rem Rode quando chegar o aviso de sessão expirada. Pode ser por duplo clique.
pwsh -NoProfile -File "%~dp0scripts\login.ps1"
pause
