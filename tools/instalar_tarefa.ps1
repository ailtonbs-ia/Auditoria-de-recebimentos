# Registra a tarefa agendada que roda auto_push.ps1 todos os dias as 19:00.
#   powershell -ExecutionPolicy Bypass -File tools\instalar_tarefa.ps1
#   powershell -ExecutionPolicy Bypass -File tools\instalar_tarefa.ps1 -Remover
param(
  [string]$Horario = "19:00",
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
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Principal $principal `
  -Description "Se os txt da pasta Bases mudaram, gera dados.js/dados.json e faz commit + push." -Force | Out-Null

Write-Host "Tarefa '$nome' registrada: todos os dias as $Horario (roda ao ligar o PC se o horario foi perdido)."
Get-ScheduledTask -TaskName $nome | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime | Format-List
