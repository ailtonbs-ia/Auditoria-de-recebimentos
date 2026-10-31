# Se os txt da pasta Bases mudaram: roda o parse_auditoria.py, faz commit e push.
# Executado pela tarefa agendada (ver instalar_tarefa.ps1); pode ser rodado manualmente.
#   -Simular : roda o parser mesmo sem mudancas e NAO faz commit/push (para teste).
param(
  [switch]$Simular,
  [int]$EstavelMinutos = 2,
  [int]$EsperaMaxMinutos = 15
)
$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$repo = Split-Path -Parent $toolsDir
$pyExe = Join-Path $toolsDir "python\python.exe"
$logDir = Join-Path $toolsDir "logs"
$logFile = Join-Path $logDir "auto_push.log"
$lockFile = Join-Path $toolsDir "auto_push.lock"
$arquivosDados = @("dados.js", "dados.json")

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 2MB) {
  Move-Item -LiteralPath $logFile -Destination "$logFile.old" -Force
}

function Log([string]$msg) {
  $linha = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -LiteralPath $logFile -Value $linha -Encoding UTF8
  Write-Host $linha
}

function Invoke-Git {
  $ErrorActionPreference = "Continue"
  $saida = & git -c core.quotepath=false @args 2>&1 | ForEach-Object { "$_" }
  return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Saida = ($saida -join "`n") }
}

function TxtsAlterados {
  $ErrorActionPreference = "Continue"
  $bruto = (& git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all -- Bases 2>$null) -join ""
  $lista = @()
  foreach ($entrada in ($bruto -split "`0")) {
    if ($entrada.Length -lt 4) { continue }
    $caminho = $entrada.Substring(3)
    if ($caminho -like "*.txt") { $lista += $caminho }
  }
  return $lista
}

function MinutosDesdeUltimaGravacao([string[]]$caminhos) {
  $maisRecente = [datetime]::MinValue
  foreach ($c in $caminhos) {
    $full = Join-Path $repo $c
    if (Test-Path -LiteralPath $full) {
      $t = (Get-Item -LiteralPath $full).LastWriteTime
      if ($t -gt $maisRecente) { $maisRecente = $t }
    }
  }
  return ((Get-Date) - $maisRecente).TotalMinutes
}

function Enviar {
  $r = Invoke-Git push origin HEAD
  if ($r.Ok) { Log "Push OK." } else { Log "ERRO no push (o commit ficou local e sera reenviado na proxima execucao):`n$($r.Saida)" }
  return $r.Ok
}

$lock = $null
try {
  try {
    $lock = [System.IO.File]::Open($lockFile, "OpenOrCreate", "ReadWrite", "None")
  } catch {
    Log "Outra execucao em andamento; saindo."
    exit 0
  }

  Set-Location -LiteralPath $repo
  Log "=== Inicio (repo: $repo)$(if ($Simular) { ' [SIMULACAO]' })"

  $alterados = @(TxtsAlterados)
  if (-not $alterados.Count -and -not $Simular) {
    $pendentes = Invoke-Git rev-list --count "@{u}..HEAD"
    if ($pendentes.Ok -and [int]$pendentes.Saida -gt 0) {
      Log "Sem mudancas nos txt, mas ha $($pendentes.Saida) commit(s) nao enviados. Tentando push."
      if (-not (Enviar)) { exit 1 }
    } else {
      Log "Sem mudancas nos txt da pasta Bases."
    }
    exit 0
  }

  if ($alterados.Count) {
    Log "Txt alterados: $($alterados -join ', ')"
    $limite = (Get-Date).AddMinutes($EsperaMaxMinutos)
    while ((MinutosDesdeUltimaGravacao $alterados) -lt $EstavelMinutos) {
      if ((Get-Date) -gt $limite) {
        Log "ERRO: os txt continuam sendo gravados apos $EsperaMaxMinutos min; abortando sem commit."
        exit 1
      }
      Log "Txt gravados ha menos de $EstavelMinutos min; aguardando 1 min..."
      Start-Sleep -Seconds 60
      $alterados = @(TxtsAlterados)
    }
  }

  if (-not (Test-Path -LiteralPath $pyExe)) {
    Log "ERRO: Python portatil nao encontrado em $pyExe. Rode tools\setup_python.ps1."
    exit 1
  }

  Log "Rodando parse_auditoria.py ..."
  $env:PYTHONIOENCODING = "utf-8"
  $ErrorActionPreference = "Continue"
  $saidaParser = & $pyExe (Join-Path $repo "parse_auditoria.py") 2>&1 | ForEach-Object { "$_" }
  $codParser = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  Log ($saidaParser -join "`n")
  if ($codParser -ne 0) {
    Log "ERRO: parse_auditoria.py terminou com codigo $codParser; nada foi commitado."
    exit 1
  }

  $paraCommit = @(TxtsAlterados) + $arquivosDados
  if ($Simular) {
    Log "SIMULACAO: commitaria $($paraCommit -join ', '). Nenhum commit/push feito."
    exit 0
  }

  $r = Invoke-Git add -- @paraCommit
  if (-not $r.Ok) { Log "ERRO no git add:`n$($r.Saida)"; exit 1 }

  $mensagem = "Update $(Get-Date -Format 'dd/MM/yy')"
  $r = Invoke-Git commit -m $mensagem -- @paraCommit
  if (-not $r.Ok) { Log "ERRO no git commit:`n$($r.Saida)"; exit 1 }
  Log "Commit '$mensagem' criado: $($paraCommit -join ', ')"

  if (-not (Enviar)) { exit 1 }
  exit 0
}
catch {
  Log "ERRO inesperado: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($lock) { $lock.Dispose() }
}
