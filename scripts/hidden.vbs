' Launcher oculto para as tasks \Claude\Kindle*: roda um .ps1 desta pasta com janela invisivel (0)
' e espera terminar (True). Sem isto, o pwsh abre um console na tela quando a sessao esta logada.
' Uso: wscript.exe E:\kindle-scrapper\scripts\hidden.vbs daily-sync.ps1
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "pwsh.exe -NoProfile -NonInteractive -File """ & dir & "\" & WScript.Arguments(0) & """"
WScript.Quit sh.Run(cmd, 0, True)
