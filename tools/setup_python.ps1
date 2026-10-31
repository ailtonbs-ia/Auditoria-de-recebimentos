# Baixa o Python embeddable (portatil, sem instalacao) em tools\python.
# Rodar uma vez: powershell -ExecutionPolicy Bypass -File tools\setup_python.ps1
param(
  [string]$Versao = "3.12.10",
  [switch]$Forcar
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyDir = Join-Path $toolsDir "python"
$pyExe = Join-Path $pyDir "python.exe"

if ((Test-Path -LiteralPath $pyExe) -and -not $Forcar) {
  Write-Host "Python ja existe em $pyExe (use -Forcar para reinstalar)."
  & $pyExe --version
  exit 0
}

$url = "https://www.python.org/ftp/python/$Versao/python-$Versao-embed-amd64.zip"
$zip = Join-Path $env:TEMP "python-$Versao-embed-amd64.zip"

Write-Host "Baixando $url"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

if (Test-Path -LiteralPath $pyDir) { Remove-Item -LiteralPath $pyDir -Recurse -Force }
New-Item -ItemType Directory -Path $pyDir | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $pyDir -Force
Remove-Item -LiteralPath $zip -Force

& $pyExe --version
Write-Host "Python portatil pronto em $pyDir"
