' Roda auto_push.ps1 sem abrir janela (usado pela tarefa agendada).
Set fso = CreateObject("Scripting.FileSystemObject")
script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "auto_push.ps1")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """"
WScript.Quit CreateObject("WScript.Shell").Run(cmd, 0, True)
