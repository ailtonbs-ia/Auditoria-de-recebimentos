# Registra a tarefa agendada que roda auto_push.ps1 todos os dias as 18:00.
#   powershell -ExecutionPolicy Bypass -File tools\instalar_tarefa.ps1
#   powershell -ExecutionPolicy Bypass -File tools\instalar_tarefa.ps1 -Remover
param(
  [string]$Horario = "18:00",
  [switch]$Remover
)
$ErrorActionPreference = "Stop"
$nome = "Auditoria - Auto Push"

if ($Remover) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa '$nome' removida."
  exit 0
}

$vbs = Join-Path $PSScriptRoot "run_hidden.vbs"
$usuario = "$env:USERDOMAIN\$env:USERNAME"

$acao = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $PSScriptRoot
# 18:00 e novas tentativas a cada 30 min ate 22:00: o extrato as vezes so aparece
# no PC depois das 18:00, quando o OneDrive termina de sincronizar a pasta Bases.
$gatilhoNoite = New-ScheduledTaskTrigger -Daily -At $Horario
$repeticao = New-ScheduledTaskTrigger -Once -At $Horario `
  -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 4)
$gatilhoNoite.Repetition = $repeticao.Repetition
# 08:30 recupera txt que sincronizou de madrugada e perdeu a janela da noite.
$gatilhoManha = New-ScheduledTaskTrigger -Daily -At "08:30"
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger @($gatilhoNoite, $gatilhoManha) -Settings $config -Principal $principal `
  -Description "Se os txt da pasta Bases mudaram, gera dados.js/dados.json e faz commit + push." -Force | Out-Null

Write-Host "Tarefa '$nome' registrada: todos os dias as $Horario (repete a cada 30 min por 4 h) e as 08:30."
Write-Host "Roda ao ligar o PC se o horario foi perdido."
Get-ScheduledTask -TaskName $nome | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime | Format-List
Get-ScheduledTask -TaskName $nome | Select-Object -ExpandProperty Triggers | Format-List
