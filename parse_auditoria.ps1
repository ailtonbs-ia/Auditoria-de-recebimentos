# Fallback quando python nao esta no PATH. Gera dados.json e dados.js
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$enc = [System.Text.Encoding]::GetEncoding(1252)
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$destTxt = Join-Path $base "auditoria central.txt"
$auditHeader = "SEQAUXNOTAFISCAL;NROEMPRESA;NOMEREDUZIDO;NUMERONF;SERIENF;SEQPESSOA;NOMEPESSOA;TIPNOTAFISCAL;OPERACAO;PRODUTO;DIASPRAZO;DESCGENERICA;VALORANTIGO;VALORNOVO;DTAHORALTERACAO;USUALTERACAO;TERMINALUSUALTERA;APPORIGEM;VERSAOSISTEMA;NFECHAVEACESSO"

function Fold([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return "" }
  $t = $s.ToLowerInvariant()
  $t = [regex]::Replace($t, "[\u00e1\u00e0\u00e3\u00e2]", "a")
  $t = [regex]::Replace($t, "[\u00e9\u00ea]", "e")
  $t = [regex]::Replace($t, "[\u00ed]", "i")
  $t = [regex]::Replace($t, "[\u00f3\u00f4\u00f5]", "o")
  $t = [regex]::Replace($t, "[\u00fa]", "u")
  $t = [regex]::Replace($t, "[\u00e7]", "c")
  return $t
}
function ParseNum([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  $t = $raw.Trim().Replace(" ","")
  if ($t.Contains(",") -and $t.Contains(".")) { $t = $t.Replace(".","").Replace(",",".") }
  elseif ($t.Contains(",")) { $t = $t.Replace(",",".") }
  $n = 0.0
  if ([double]::TryParse($t, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $n }
  return $null
}
function ParseDt([string]$raw) {
  $iso = ""; $data = ""; $hora = ""
  if ($raw -match "^(\d{4}-\d{2}-\d{2})-(\d{2})\.(\d{2})\.(\d{2})") {
    $data = $Matches[1]; $hora = "$($Matches[2]):$($Matches[3]):$($Matches[4])"; $iso = "$data`T$hora"
  }
  return @{ iso = $iso; data = $data; hora = $hora }
}
function TipoRegra([string]$campo) {
  $t = Fold $campo
  if ($t -match "pedido") { return "pedido" }
  if ($t -match "preco de venda") { if ($t -match "abaixo") { return "venda_abaixo" } else { return "venda_acima" } }
  if ($t -match "custo") { if ($t -match "abaixo") { return "custo_abaixo" } else { return "custo_acima" } }
  return "outros"
}
function EhFiscal([string]$campo) {
  $t = Fold $campo
  foreach ($c in @("valor icms","valor total isento","base de calculo icms","valor total do item","valor pis","valor cofins","valor ipi","aliquota")) {
    if ($t.Contains($c)) { return $true }
  }
  return $false
}
function EhRuido([string]$campo) {
  $t = Fold $campo
  foreach ($c in @("status de retorno da man","mensagem retorno da man","quantidade conferida","nota em edicao","recalculou a tributacao","codigo ncm xml","indica se","numero empresa","numero da carga","data e hora lancamento","data vencimento","conferencia de carga")) {
    if ($t.Contains($c)) { return $true }
  }
  return $false
}
function New-Ev($tipo, $detalhe, $dt, $op, $produto, $campo, $antigo, $novo, $usuario) {
  $u = Info-Usuario $usuario
  return @{
    iso = $dt.iso; data = $dt.data; hora = $dt.hora; operacao = $op; tipo = $tipo; produto = $produto
    campo = $campo; valor_antigo = $antigo; valor_novo = $novo; usuario = $usuario; detalhe = $detalhe
    usuario_nome = $u.nome; usuario_grupo = $u.grupo; usuario_eh_central = $u.eh_central
  }
}
function EhLojaFora([string]$loja, [string]$nro) {
  $l = ($loja | Out-String).Trim().ToUpperInvariant()
  if ($l.StartsWith("C001")) { return $true }
  if ($l.StartsWith("R066")) { return $true }
  return $false
}
function EhForn331([string]$seqpessoa, [string]$fornecedor) {
  if (($seqpessoa | Out-String).Trim() -eq "331") { return $true }
  $f = ($fornecedor | Out-String).Trim()
  return $f -match "^331(\s|$|-)"
}
function Norm-Codigo([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  $t = $s.Trim()
  if ($t -match "^(\d+)\.0+$") { $t = $Matches[1] }
  $n = $t -replace "^0+", ""
  if ($n) { return $n }
  return $t
}
function EhCentralGrupo([string]$g) {
  $t = Fold $g
  return $t.Contains("central de recebimento")
}
function Col-Ref([string]$ref) {
  if ($ref -match "^([A-Z]+)") { return $Matches[1] }
  return ""
}
function Info-Usuario([string]$codigo) {
  $n = Norm-Codigo $codigo
  if ($n -and $script:usuariosMap.ContainsKey($n)) { return $script:usuariosMap[$n] }
  if ($codigo -and $script:usuariosMap.ContainsKey($codigo)) { return $script:usuariosMap[$codigo] }
  $exibir = $(if ($codigo) { $codigo.Trim() } else { "" })
  return @{ codigo = $(if ($n) { $n } else { $exibir }); nome = $exibir; grupo = ""; eh_central = $false; cadastrado = $false }
}
function Norm-Segmento([string]$raw) {
  $t = Fold $raw
  if ($t -match "^lojas?$") { return "LOJAS" }
  if ($t -match "^emporios?$" -or $t -match "^emp[oó]rios?$") { return "EMPORIOS" }
  if ($t -match "^mercearias?$") { return "MERCEARIA" }
  if ($t -eq "cd") { return "CD" }
  if ($t -eq "barra") { return "BARRA" }
  if ($t -eq "agro") { return "AGRO" }
  return ($(if ($raw) { $raw.Trim().ToUpperInvariant() } else { "" }))
}

function Read-XlsxRows([string]$srcPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmp = Join-Path $env:TEMP ("xlsx_parse_" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $rows = New-Object System.Collections.Generic.List[object]
  try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory($srcPath, $tmp)
    $sstPath = Join-Path $tmp "xl\sharedStrings.xml"
    $strings = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $sstPath) {
      $sstXml = [xml](Get-Content -LiteralPath $sstPath -Raw -Encoding UTF8)
      foreach ($si in $sstXml.sst.si) {
        if ($si.t) { [void]$strings.Add([string]$si.t) }
        else { [void]$strings.Add((($si.r | ForEach-Object { $_.t }) -join "")) }
      }
    }
    $sheetXml = [xml](Get-Content -LiteralPath (Join-Path $tmp "xl\worksheets\sheet1.xml") -Raw -Encoding UTF8)
    foreach ($row in $sheetXml.worksheet.sheetData.row) {
      $cells = @{}
      foreach ($c in $row.c) {
        $col = Col-Ref $c.r
        $v = [string]$c.v
        if ($c.t -eq "s" -and $v -match "^\d+$") { $v = $strings[[int]$v] }
        $cells[$col] = $v
      }
      $rows.Add($cells)
    }
  }
  finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  return $rows
}

function Ler-ListaUsuarios([string]$dir) {
  $xlsx = @(Get-ChildItem -LiteralPath $dir -Filter "*Usuario*.xlsx" -ErrorAction SilentlyContinue)
  $mapa = @{}
  $equipe = New-Object System.Collections.Generic.List[object]
  if (-not $xlsx.Count) {
    Write-Host "Lista de usuarios .xlsx nao encontrada; monitoramento segue so com codigos."
    return @{ mapa = $mapa; equipe = $equipe; arquivo = ""; total = 0 }
  }
  $src = $xlsx[0]
  $total = 0
  foreach ($cells in (Read-XlsxRows $src.FullName)) {
    $codigoRaw = $(if ($cells.ContainsKey("B")) { $cells.B } else { "" })
    $nome = $(if ($cells.ContainsKey("C")) { $cells.C } else { "" })
    $grupo = $(if ($cells.ContainsKey("D")) { $cells.D } else { "" })
    $codigo = Norm-Codigo $codigoRaw
    if (-not $codigo) { continue }
    if ((Fold $codigoRaw) -eq "usuario" -or (Fold $nome) -eq "nome") { continue }
    $info = @{
      codigo = $codigo
      nome = $(if ($nome) { $nome.Trim() } else { $codigo })
      grupo = $(if ($grupo) { $grupo.Trim() } else { "" })
      eh_central = [bool](EhCentralGrupo $grupo)
      cadastrado = $true
    }
    $mapa[$codigo] = $info
    if ($codigoRaw -and -not $mapa.ContainsKey($codigoRaw.Trim())) { $mapa[$codigoRaw.Trim()] = $info }
    if ($info.eh_central) { $equipe.Add($info) }
    $total++
  }
  Write-Host ("Usuarios na planilha {0}: {1} | Central: {2}" -f $src.Name, $total, $equipe.Count)
  return @{ mapa = $mapa; equipe = $equipe; arquivo = $src.Name; total = $total }
}

function Ler-ListaEmpresas([string]$dir) {
  $xlsx = @(Get-ChildItem -LiteralPath $dir -Filter "*Empresa*.xlsx" -ErrorAction SilentlyContinue)
  $byNro = @{}
  $byLoja = @{}
  $cobertura = New-Object System.Collections.Generic.List[object]
  if (-not $xlsx.Count) {
    Write-Host "Lista de Empresas.xlsx nao encontrada; cobertura usa so as lojas do lote."
    return @{ nro = $byNro; loja = $byLoja; cobertura = $cobertura; arquivo = "" }
  }
  $src = $xlsx[0]
  $cobSet = @("LOJAS", "EMPORIOS", "MERCEARIA")
  foreach ($cells in (Read-XlsxRows $src.FullName)) {
    $nroRaw = $(if ($cells.ContainsKey("A")) { $cells.A } else { "" })
    $loja = $(if ($cells.ContainsKey("B")) { [string]$cells.B } else { "" }).Trim()
    $razao = $(if ($cells.ContainsKey("C")) { [string]$cells.C } else { "" }).Trim()
    $segRaw = $(if ($cells.ContainsKey("F")) { [string]$cells.F } else { "" })
    $segmento = Norm-Segmento $segRaw
    $nro = Norm-Codigo $nroRaw
    if (-not $nro -and -not $loja) { continue }
    if ((Fold $nroRaw) -eq "nroempresa" -or (Fold $loja) -eq "nomereduzido") { continue }
    $info = @{
      nroempresa = $nro
      loja = $loja
      razao = $razao
      segmento = $segmento
    }
    if ($nro) { $byNro[$nro] = $info }
    if ($loja) { $byLoja[$loja] = $info }
    if ($cobSet -contains $segmento -and -not (EhLojaFora $loja $nro)) {
      $cobertura.Add(@{ nroempresa = $nro; loja = $loja; segmento = $segmento })
    }
  }
  $ord = @{ LOJAS = 0; EMPORIOS = 1; MERCEARIA = 2 }
  $cobertura = @($cobertura | Sort-Object @{ Expression = { $ord[$_.segmento] } }, loja)
  $nLojas = @($cobertura | Where-Object { $_.segmento -eq "LOJAS" }).Count
  $nEmp = @($cobertura | Where-Object { $_.segmento -eq "EMPORIOS" }).Count
  $nMerc = @($cobertura | Where-Object { $_.segmento -eq "MERCEARIA" }).Count
  Write-Host ("Empresas na planilha {0}: {1} | Lojas {2} | Emporios {3} | Mercearias {4}" -f $src.Name, $byNro.Count, $nLojas, $nEmp, $nMerc)
  return @{ nro = $byNro; loja = $byLoja; cobertura = $cobertura; arquivo = $src.Name }
}

function Info-Empresa([string]$nro, [string]$loja) {
  $n = Norm-Codigo $nro
  if ($n -and $script:empresasNro.ContainsKey($n)) { return $script:empresasNro[$n] }
  $nome = $(if ($loja) { $loja.Trim() } else { "" })
  if ($nome -and $script:empresasLoja.ContainsKey($nome)) { return $script:empresasLoja[$nome] }
  return @{ nroempresa = $(if ($n) { $n } else { $nro }); loja = $nome; razao = ""; segmento = "" }
}

function Carimbar-Empresa($rec) {
  $emp = Info-Empresa $rec.nroempresa $rec.loja
  $rec.segmento = $(if ($emp.segmento) { $emp.segmento } else { "" })
}

function Test-AuditTxt([string]$path) {
  $sr = New-Object System.IO.StreamReader($path, $enc)
  try { $line = $sr.ReadLine() } finally { $sr.Close() }
  if (-not $line) { return $false }
  $n = $line.Trim().ToUpperInvariant().Replace("`t", ";")
  return $n.StartsWith("SEQAUXNOTAFISCAL")
}

function Get-AuditDelim([string]$header) {
  $tabs = ($header.ToCharArray() | Where-Object { $_ -eq "`t" }).Count
  if ($tabs -ge 19) { return "`t" }
  return ";"
}

function Split-AuditRow([string]$line, [string]$delim) {
  $parts = $line.Split($delim)
  if ($parts.Length -lt 20) { return $null }
  if ($parts.Length -gt 20) {
    $tail = ($parts[19..($parts.Length - 1)] -join $delim)
    $parts = @($parts[0..18]) + @($tail)
  }
  return $parts
}

function Get-ChaveNfe([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
  $t = $raw.Trim()
  if ($t -match "[eE][+-]?\d+") { return "" }
  $digits = [regex]::Replace($t, "\D", "")
  if ($digits.Length -ge 44) { return $digits.Substring(0, 44) }
  return ""
}

function Get-RowKey([string[]]$parts) {
  $vals = New-Object string[] 8
  $idx = @(0, 8, 9, 11, 12, 13, 14, 15)
  for ($n = 0; $n -lt 8; $n++) {
    $i = $idx[$n]
    if ($i -lt $parts.Length -and $null -ne $parts[$i]) { $vals[$n] = $parts[$i].Trim() }
    else { $vals[$n] = "" }
  }
  return ($vals -join "|")
}

function Get-AuditLotes {
  $list = New-Object System.Collections.Generic.List[string]
  if ((Test-Path -LiteralPath $destTxt) -and (Test-AuditTxt $destTxt)) {
    $list.Add($destTxt)
  }
  $destFull = $null
  if (Test-Path -LiteralPath $destTxt) { $destFull = [IO.Path]::GetFullPath($destTxt) }
  $pastas = New-Object System.Collections.Generic.List[string]
  $pastas.Add($base)
  foreach ($nome in @("Bases", "BASES")) {
    $pasta = Join-Path $base $nome
    if (Test-Path -LiteralPath $pasta -PathType Container) {
      $fullDir = [IO.Path]::GetFullPath($pasta)
      $jaTem = $false
      foreach ($p in $pastas) {
        if ([IO.Path]::GetFullPath($p) -eq $fullDir) { $jaTem = $true; break }
      }
      if (-not $jaTem) { $pastas.Add($pasta) }
    }
  }
  $seen = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($item in $list) { [void]$seen.Add([IO.Path]::GetFullPath($item)) }
  foreach ($pasta in $pastas) {
    Get-ChildItem -LiteralPath $pasta -Filter "*.txt" | Sort-Object Name | ForEach-Object {
      $full = [IO.Path]::GetFullPath($_.FullName)
      if ($destFull -and ($full -eq $destFull)) { return }
      if ($seen.Contains($full)) { return }
      if (Test-AuditTxt $full) {
        $list.Add($full)
        [void]$seen.Add($full)
      }
    }
  }
  return $list
}

function Consolidate-Base {
  $lotes = @(Get-AuditLotes)
  if (-not $lotes.Count) { throw "Nenhum TXT de auditoria (cabecalho SEQAUXNOTAFISCAL) na pasta." }
  $map = New-Object "System.Collections.Generic.Dictionary[string,string[]]"
  $order = New-Object System.Collections.Generic.List[string]
  $lidos = 0
  $dups = 0
  foreach ($path in $lotes) {
    $sr = New-Object System.IO.StreamReader($path, $enc)
    try {
      $header = $sr.ReadLine()
      $delim = Get-AuditDelim $header
      while ($null -ne ($line = $sr.ReadLine())) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = Split-AuditRow $line $delim
        if ($null -eq $parts) { continue }
        if ($parts[0].Trim().ToUpperInvariant() -eq "SEQAUXNOTAFISCAL") { continue }
        $lidos++
        $key = Get-RowKey $parts
        if ($map.ContainsKey($key)) {
          $dups++
          $old = $map[$key]
          $chOld = Get-ChaveNfe $(if ($old.Length -gt 19) { $old[19] } else { "" })
          $chNew = Get-ChaveNfe $(if ($parts.Length -gt 19) { $parts[19] } else { "" })
          if ($chNew -and -not $chOld) { $map[$key] = $parts }
          continue
        }
        $map[$key] = $parts
        $order.Add($key)
      }
    }
    finally { $sr.Close() }
  }
  $tmp = "$destTxt.tmp"
  $sw = New-Object System.IO.StreamWriter($tmp, $false, $enc)
  try {
    $sw.WriteLine($auditHeader)
    foreach ($k in $order) {
      $sw.WriteLine(($map[$k] -join ";"))
    }
  }
  finally { $sw.Close() }
  Move-Item -LiteralPath $tmp -Destination $destTxt -Force
  Write-Host ("Base 0: {0} linhas unicas de {1} lote(s) ({2} lidas, {3} duplicatas ignoradas) -> auditoria central.txt" -f $order.Count, $lotes.Count, $lidos, $dups)
  return $lotes.Count
}

$nLotes = Consolidate-Base
$txt = Get-Item -LiteralPath $destTxt

$script:usuariosMap = @{}
$listaUsuarios = Ler-ListaUsuarios $base
$script:usuariosMap = $listaUsuarios.mapa
$listaEmpresas = Ler-ListaEmpresas $base
$script:empresasNro = $listaEmpresas.nro
$script:empresasLoja = $listaEmpresas.loja

$nfs = @{}
$produtosNf = @{}
$volumeLojas = @{}
$volumeDias = @{}
$lojasSet = New-Object "System.Collections.Generic.HashSet[string]"
$fornSet = New-Object "System.Collections.Generic.HashSet[string]"
$userSet = New-Object "System.Collections.Generic.HashSet[string]"
$opsCount = @{}
$inconsistencias = New-Object System.Collections.Generic.List[object]
$operacional = New-Object System.Collections.Generic.List[object]
$lancamentos = New-Object System.Collections.Generic.List[object]
$timelines = @{}
$aceite = @{}
$totalEventos = 0
$totalIn = 0
$seq = 0

$sr = New-Object System.IO.StreamReader($txt.FullName, $enc)
try {
  while ($null -ne ($line = $sr.ReadLine())) {
    $parts = $line.Split(";")
    if ($parts.Length -lt 20) { continue }
    if ($parts[0] -eq "SEQAUXNOTAFISCAL" -or [string]::IsNullOrWhiteSpace($parts[0])) { continue }
    $nro = $parts[1]
    $loja = $parts[2]
    if (EhLojaFora $loja $nro) { continue }
    $seqp = $parts[5]
    $forn = $parts[6]
    if (EhForn331 $seqp $forn) { continue }
    $totalEventos++
    $seq++
    $seqaux = $parts[0]
    $numeronf = $parts[3]
    $serie = $parts[4]
    $forn = $parts[6]
    $op = $parts[8].Trim().ToUpperInvariant()
    $produto = $parts[9]
    $campo = $parts[11]
    $antigo = $parts[12]
    $novo = $parts[13]
    $dt = ParseDt $parts[14]
    $usuario = $parts[15]
    $chave = if ($parts.Length -gt 20) { ($parts[19..($parts.Length-1)] -join ";") } else { $parts[19] }
    $key = "$seqaux|$chave"
    if (-not $opsCount.ContainsKey($op)) { $opsCount[$op] = 0 }
    $opsCount[$op]++
    [void]$lojasSet.Add($loja)
    if ($forn) { [void]$fornSet.Add($forn) }
    $uf = Fold $usuario
    if ($usuario -and $uf -ne "oracle" -and $uf -ne "system" -and $uf -ne "sys") { [void]$userSet.Add($usuario) }

    $codigo = ""; $nome = $produto
    if ($produto -match "^(\d+)\s*-\s*(.+)$") { $codigo = $Matches[1]; $nome = $Matches[2].Trim() }

    if (-not $nfs.ContainsKey($key)) {
      $nfs[$key] = @{ seqaux=$seqaux; nroempresa=$nro; loja=$loja; numeronf=$numeronf; serienf=$serie; fornecedor=$forn; chave=$chave; tem_in=$false; primeira=$dt.iso; ultima=$dt.iso }
      $produtosNf[$key] = @{}
      $timelines[$key] = New-Object System.Collections.Generic.List[object]
      $aceite[$key] = @{ usuario=""; justificativa=""; status="" }
    }
    $h = $nfs[$key]
    if ($dt.iso -and (-not $h.primeira -or $dt.iso -lt $h.primeira)) { $h.primeira = $dt.iso }
    if ($dt.iso -and $dt.iso -gt $h.ultima) { $h.ultima = $dt.iso }
    if ($codigo) { $produtosNf[$key][$codigo] = $nome }

    if ($op -eq "IN") {
      $totalIn++
      if (-not $h.tem_in) {
        $h.tem_in = $true
        $h.usuario_in = $usuario
        $lk = $(if ($loja) { $loja } else { $nro })
        if (-not $volumeLojas.ContainsKey($lk)) { $volumeLojas[$lk] = 0 }
        $volumeLojas[$lk]++
        if ($dt.data) {
          if (-not $volumeDias.ContainsKey($dt.data)) { $volumeDias[$dt.data] = 0 }
          $volumeDias[$dt.data]++
        }
        $lancamentos.Add(@{
          nf_id=$key; seqaux=$seqaux; nroempresa=$nro; loja=$loja; numeronf=$numeronf; serienf=$serie
          fornecedor=$forn; chave=$chave; iso=$dt.iso; data=$dt.data; hora=$dt.hora; usuario=$usuario
        })
      }
      $timelines[$key].Add((New-Ev "inclusao" "Inclusao da nota" $dt $op $produto $campo $antigo $novo $usuario))
    }
    elseif ($op -eq "EN") {
      $operacional.Add(@{ id="$key|EN|$($dt.iso)|$seq"; seqaux=$seqaux; nroempresa=$nro; loja=$loja; numeronf=$numeronf; serienf=$serie; fornecedor=$forn; chave=$chave; tipo="exclusao_nf"; produto=""; campo="Exclusao da nota"; valor_antigo=$antigo; valor_novo=$novo; iso=$dt.iso; data=$dt.data; hora=$dt.hora; usuario=$usuario })
      $timelines[$key].Add((New-Ev "exclusao_nf" "Exclusao da nota" $dt $op $produto $campo $antigo $novo $usuario))
    }
    elseif ($op -eq "EP") {
      $operacional.Add(@{ id="$key|EP|$codigo|$($dt.iso)|$seq"; seqaux=$seqaux; nroempresa=$nro; loja=$loja; numeronf=$numeronf; serienf=$serie; fornecedor=$forn; chave=$chave; tipo="exclusao_produto"; produto=$produto; produto_codigo=$codigo; campo=$(if ($campo) { $campo } else { "Exclusao de produto" }); valor_antigo=$antigo; valor_novo=$novo; iso=$dt.iso; data=$dt.data; hora=$dt.hora; usuario=$usuario })
      $timelines[$key].Add((New-Ev "exclusao_produto" $(if ($produto) { $produto } else { "Exclusao de produto" }) $dt $op $produto $campo $antigo $novo $usuario))
    }
    elseif ($op -eq "AI") {
      $cf = Fold $campo
      if ($cf -match "usuario de aceite") {
        $aceite[$key].usuario = $(if ($novo) { $novo } elseif ($antigo) { $antigo } else { $usuario })
        $timelines[$key].Add((New-Ev "aceite" ("Usuario de aceite: " + $aceite[$key].usuario) $dt $op $produto $campo $antigo $novo $usuario))
      }
      elseif ($cf -match "justific") {
        $just = $(if ($novo) { $novo } else { $antigo })
        if ($just) { $aceite[$key].justificativa = $just }
        $timelines[$key].Add((New-Ev "justificativa" $(if ($just) { $just } else { "Justificativa" }) $dt $op $produto $campo $antigo $novo $usuario))
      }
      else {
        $tipo = TipoRegra $campo
        $status = $(if ($novo) { $novo } elseif ($antigo) { $antigo } else { "" })
        if ((Fold $antigo) -eq "nota inconsistente" -or (Fold $status) -match "inconsist") { $aceite[$key].status = $status }
        $pcod = $codigo
        if ($campo -match "produto\s+(\d+)") { $pcod = $Matches[1] }
        $unit = $null; $ref = $null; $lim = $null; $pedOrig = $null; $pedLim = $null
        if ($campo -match "produto\s+(\d+)\s*\(([\d.,]+)\)\s+est.?\s+(acima|abaixo)\s+do\s+pre[cç]o\s+de\s+venda\s+\(([\d.,]+)\)") {
          $pcod = $Matches[1]; $unit = ParseNum $Matches[2]; $ref = ParseNum $Matches[4]
        }
        if ($campo -match "produto\s+(\d+).{0,40}est.?\s+(acima|abaixo)\s+do\s+custo.{0,40}limite:\s*([\d.,]+)") {
          $pcod = $Matches[1]; $lim = ParseNum $Matches[3]
        }
        if ($campo -match "Valor total do item\s*\(([\d.,]+)\).{0,80}pedido.{0,40}\(([\d.,]+)\)\.\s*Valor original do Pedido\s*\(([\d.,]+)\)") {
          $unit = ParseNum $Matches[1]; $pedLim = ParseNum $Matches[2]; $pedOrig = ParseNum $Matches[3]; $ref = $pedOrig
        }
        if ($campo -match "limite\s*\(%\)\s*=\s*\(([\d.,]+)\)") { $lim = ParseNum $Matches[1] }
        $pnome = ""
        if ($pcod -and $produtosNf[$key].ContainsKey($pcod)) { $pnome = $produtosNf[$key][$pcod] } else { $pnome = $nome }
        $plabel = $(if ($pcod -or $pnome) { "$pcod - $pnome".Trim(" -") } else { "" })
        $inconsistencias.Add(@{
          id="$key|AI|$pcod|$($dt.iso)|$seq"; nf_id=$key; seqaux=$seqaux; nroempresa=$nro; loja=$loja; numeronf=$numeronf; serienf=$serie; fornecedor=$forn; chave=$chave;
          tipo=$tipo; status=$status; mensagem=$campo; produto_codigo=$pcod; produto_nome=$pnome; produto=$plabel;
          unitario=$unit; referencia=$ref; limite=$lim; pedido_original=$pedOrig; pedido_limite=$pedLim;
          valor_antigo=$antigo; valor_novo=$novo; iso=$dt.iso; data=$dt.data; hora=$dt.hora; usuario=$usuario; aceite_usuario=""; justificativa=""
        })
        $timelines[$key].Add((New-Ev $tipo $campo $dt $op $produto $campo $antigo $novo $usuario))
      }
    }
    elseif ($op -eq "AP") {
      # Recalculo tributario gera milhares de de/para de centavos; fora do recorte operacional.
    }
    elseif ($op -eq "IV" -or $op -eq "EV") {
      $det = $(if ($op -eq "IV") { "Vencimento" } else { "Exclusao de vencimento" })
      $timelines[$key].Add((New-Ev "vencimento" $det $dt $op $produto $campo $antigo $novo $usuario))
    }
  }
}
finally { $sr.Close() }

foreach ($item in $inconsistencias) {
  $m = $aceite[$item.nf_id]
  $item.aceite_usuario = $(if ($m.usuario) { $m.usuario } else { $item.usuario })
  $item.justificativa = $(if ($m.justificativa) { $m.justificativa } else { "" })
  if (-not $item.status) { $item.status = $m.status }
  if ($item.produto_codigo -and -not $item.produto_nome -and $produtosNf[$item.nf_id].ContainsKey($item.produto_codigo)) {
    $item.produto_nome = $produtosNf[$item.nf_id][$item.produto_codigo]
    $item.produto = "$($item.produto_codigo) - $($item.produto_nome)"
  }
  $uExec = Info-Usuario $item.usuario
  $item.usuario_nome = $uExec.nome
  $item.usuario_grupo = $uExec.grupo
  $item.usuario_eh_central = $uExec.eh_central
  $uAce = Info-Usuario $item.aceite_usuario
  $item.aceite_nome = $uAce.nome
  $item.aceite_grupo = $uAce.grupo
  $item.aceite_eh_central = $uAce.eh_central
}
foreach ($e in $operacional) {
  $u = Info-Usuario $e.usuario
  $e.usuario_nome = $u.nome
  $e.usuario_grupo = $u.grupo
  $e.usuario_eh_central = $u.eh_central
}
foreach ($e in $lancamentos) {
  $u = Info-Usuario $e.usuario
  $e.usuario_nome = $u.nome
  $e.usuario_grupo = $u.grupo
  $e.usuario_eh_central = $u.eh_central
}
foreach ($item in $inconsistencias) { Carimbar-Empresa $item }
foreach ($e in $operacional) { Carimbar-Empresa $e }
foreach ($e in $lancamentos) { Carimbar-Empresa $e }
foreach ($h in $nfs.Values) { Carimbar-Empresa $h }

$nfInc = New-Object "System.Collections.Generic.HashSet[string]"
foreach ($i in $inconsistencias) { [void]$nfInc.Add($i.nf_id) }
$nfOps = New-Object "System.Collections.Generic.HashSet[string]"
foreach ($e in $operacional) { [void]$nfOps.Add("$($e.seqaux)|$($e.chave)") }

$timelineOut = @{}
foreach ($key in $nfInc) {
  $seen = New-Object "System.Collections.Generic.HashSet[string]"
  $compact = New-Object System.Collections.Generic.List[object]
  foreach ($evx in ($timelines[$key] | Sort-Object iso, operacao)) {
    $sig = "$($evx.iso)|$($evx.operacao)|$($evx.campo)|$($evx.valor_antigo)|$($evx.valor_novo)|$($evx.produto)"
    if ($seen.Contains($sig)) { continue }
    [void]$seen.Add($sig)
    $compact.Add($evx)
    if ($compact.Count -ge 120) { break }
  }
  $timelineOut[$key] = $compact
}

$tipoCount = @{}
$lojaInc = @{}; $fornInc = @{}; $prodInc = @{}; $userInc = @{}; $justInc = @{}; $statusInc = @{}; $diaInc = @{}
$lojaNf = @{}
foreach ($item in $inconsistencias) {
  if (-not $tipoCount.ContainsKey($item.tipo)) { $tipoCount[$item.tipo] = 0 }; $tipoCount[$item.tipo]++
  if (-not $lojaInc.ContainsKey($item.loja)) { $lojaInc[$item.loja] = 0 }; $lojaInc[$item.loja]++
  if (-not $fornInc.ContainsKey($item.fornecedor)) { $fornInc[$item.fornecedor] = 0 }; $fornInc[$item.fornecedor]++
  $pk = $(if ($item.produto) { $item.produto } elseif ($item.produto_codigo) { $item.produto_codigo } else { "sem produto" })
  if (-not $prodInc.ContainsKey($pk)) { $prodInc[$pk] = 0 }; $prodInc[$pk]++
  $uk = $(if ($item.aceite_usuario) { $item.aceite_usuario } else { $item.usuario })
  $uNome = $(if ($item.aceite_nome) { $item.aceite_nome } else { $uk })
  if (-not $userInc.ContainsKey($uNome)) { $userInc[$uNome] = 0 }; $userInc[$uNome]++
  $jk = $(if ($item.justificativa) { $item.justificativa.Trim() } else { "(sem justificativa)" })
  if (-not $jk) { $jk = "(sem justificativa)" }
  if ($jk.ToLower() -ne "ok") {
    if (-not $justInc.ContainsKey($jk)) { $justInc[$jk] = 0 }; $justInc[$jk]++
  }
  $sk = $(if ($item.status) { $item.status } else { "(sem status)" })
  if (-not $statusInc.ContainsKey($sk)) { $statusInc[$sk] = 0 }; $statusInc[$sk]++
  if ($item.data) { if (-not $diaInc.ContainsKey($item.data)) { $diaInc[$item.data] = 0 }; $diaInc[$item.data]++ }
  if (-not $lojaNf.ContainsKey($item.loja)) { $lojaNf[$item.loja] = New-Object "System.Collections.Generic.HashSet[string]" }
  [void]$lojaNf[$item.loja].Add($item.nf_id)
}

function Rank($map, $limit) {
  $list = New-Object System.Collections.Generic.List[object]
  foreach ($k in ($map.Keys | Sort-Object { -$map[$_] }, { $_ })) {
    if ($k) { $list.Add(@{ nome=$k; qtd=$map[$k] }) }
    if ($list.Count -ge $limit) { break }
  }
  return $list
}

$rankingLoja = New-Object System.Collections.Generic.List[object]
foreach ($nome in ($lojaNf.Keys | Sort-Object { -$lojaNf[$_].Count }, { $_ })) {
  $qtdNf = $lojaNf[$nome].Count
  $totalLoja = $(if ($volumeLojas.ContainsKey($nome)) { $volumeLojas[$nome] } else { 0 })
  $taxa = $null
  if ($totalLoja) { $taxa = [Math]::Round(($qtdNf / $totalLoja) * 100, 1) }
  $rankingLoja.Add(@{ nome=$nome; nfs_inconsistentes=$qtdNf; itens=$(if ($lojaInc.ContainsKey($nome)) { $lojaInc[$nome] } else { 0 }); nfs_entrada=$totalLoja; taxa=$taxa })
  if ($rankingLoja.Count -ge 15) { break }
}

$datas = @($volumeDias.Keys + $diaInc.Keys | Where-Object { $_ } | Select-Object -Unique | Sort-Object)
$porDia = New-Object System.Collections.Generic.List[object]
foreach ($d in $datas) {
  $nInc = ($inconsistencias | Where-Object { $_.data -eq $d } | ForEach-Object { $_.nf_id } | Select-Object -Unique).Count
  $porDia.Add(@{ data=$d; nfs_entrada=$(if ($volumeDias.ContainsKey($d)) { $volumeDias[$d] } else { 0 }); itens_inconsistentes=$(if ($diaInc.ContainsKey($d)) { $diaInc[$d] } else { 0 }); nfs_inconsistentes=$nInc })
}

$nfsEntrada = @($nfs.Values | Where-Object { $_.tem_in }).Count
$nfsResumo = New-Object System.Collections.Generic.List[object]
foreach ($key in ($nfInc | Sort-Object)) {
  $hh = $nfs[$key]
  $itens = @($inconsistencias | Where-Object { $_.nf_id -eq $key })
  $tipos = @($itens.tipo | Select-Object -Unique | Sort-Object)
  $nfsResumo.Add(@{ id=$key; seqaux=$hh.seqaux; loja=$hh.loja; nroempresa=$hh.nroempresa; numeronf=$hh.numeronf; serienf=$hh.serienf; fornecedor=$hh.fornecedor; chave=$hh.chave; qtd_itens=$itens.Count; tipos=$tipos; aceite_usuario=$itens[0].aceite_usuario; aceite_nome=$itens[0].aceite_nome; aceite_grupo=$itens[0].aceite_grupo; aceite_eh_central=$itens[0].aceite_eh_central; segmento=$(if ($hh.segmento) { $hh.segmento } elseif ($itens.Count) { $itens[0].segmento } else { "" }); justificativa=$itens[0].justificativa; status=$itens[0].status; iso=$itens[0].iso; data=$itens[0].data })
}

$tipoIds = @("custo_acima","custo_abaixo","venda_acima","venda_abaixo","pedido","outros") | Where-Object { $tipoCount.ContainsKey($_) }
$tiposArr = New-Object System.Collections.Generic.List[object]
foreach ($tid in $tipoIds) { $tiposArr.Add(@{ id=$tid; qtd=$tipoCount[$tid] }) }

$opsOut = @{}
foreach ($k in ($opsCount.Keys | Sort-Object)) { $opsOut[$k] = $opsCount[$k] }
$altFiscal = @($operacional | Where-Object { $_.tipo -eq "alteracao_fiscal" }).Count
$taxa = 0
if ($nfsEntrada) { $taxa = [Math]::Round(($nfInc.Count / $nfsEntrada) * 100, 2) }

$usuariosOut = @{}
foreach ($c in $userSet) {
  $info = Info-Usuario $c
  $usuariosOut[$info.codigo] = $info
}
foreach ($item in $inconsistencias) {
  foreach ($c in @($item.usuario, $item.aceite_usuario)) {
    $info = Info-Usuario $c
    if ($info.codigo) { $usuariosOut[$info.codigo] = $info }
  }
}
foreach ($m in $listaUsuarios.equipe) { $usuariosOut[$m.codigo] = $m }

$equipeOut = New-Object System.Collections.Generic.List[object]
$seenEq = New-Object "System.Collections.Generic.HashSet[string]"
foreach ($m in $listaUsuarios.equipe) {
  if ($seenEq.Contains($m.codigo)) { continue }
  [void]$seenEq.Add($m.codigo)
  $equipeOut.Add(@{ codigo=$m.codigo; nome=$m.nome; grupo=$m.grupo; eh_central=$true })
}

$segFiltros = New-Object System.Collections.Generic.List[string]
foreach ($s in @("LOJAS", "EMPORIOS", "MERCEARIA")) {
  if (@($listaEmpresas.cobertura | Where-Object { $_.segmento -eq $s }).Count) { $segFiltros.Add($s) }
}
if (-not $segFiltros.Count) {
  foreach ($s in ($lancamentos | ForEach-Object { $_.segmento } | Where-Object { $_ } | Select-Object -Unique | Sort-Object)) {
    $segFiltros.Add($s)
  }
}
$empresasLojaOut = @{}
foreach ($k in $script:empresasLoja.Keys) {
  $v = $script:empresasLoja[$k]
  $empresasLojaOut[$k] = @{ nroempresa = $v.nroempresa; loja = $v.loja; segmento = $v.segmento }
}

$payload = @{
  gerado_em = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
  arquivo = $(if ($nLotes) { "{0} ({1} lotes)" -f $txt.Name, $nLotes } else { $txt.Name })
  usuarios_arquivo = $listaUsuarios.arquivo
  empresas_arquivo = $listaEmpresas.arquivo
  periodo = @{ inicio = $(if ($datas) { $datas[0] } else { "" }); fim = $(if ($datas) { $datas[-1] } else { "" }) }
  totais = @{
    eventos = $totalEventos
    nfs_entrada = $nfsEntrada
    inclusoes_in = $totalIn
    nfs_inconsistentes = $nfInc.Count
    itens_inconsistentes = $inconsistencias.Count
    exclusoes_nf = $(if ($opsCount.ContainsKey("EN")) { $opsCount["EN"] } else { 0 })
    exclusoes_produto = $(if ($opsCount.ContainsKey("EP")) { $opsCount["EP"] } else { 0 })
    alteracoes_fiscais = $altFiscal
    operacionais = $operacional.Count
    taxa_nfs = $taxa
    equipe_central = $equipeOut.Count
  }
  operacoes = $opsOut
  tipos = $tiposArr
  status = Rank $statusInc 10
  filtros = @{
    lojas = @($lojasSet | Sort-Object)
    fornecedores = @($fornSet | Sort-Object)
    usuarios = @($userSet | Sort-Object)
    datas = $datas
    segmentos = $segFiltros
    tipos = $tipoIds
  }
  empresas = $script:empresasNro
  empresas_loja = $empresasLojaOut
  cobertura = $listaEmpresas.cobertura
  rankings = @{
    lojas = $rankingLoja
    fornecedores = Rank $fornInc 12
    produtos = Rank $prodInc 12
    usuarios = Rank $userInc 12
    justificativas = Rank $justInc 12
  }
  por_dia = $porDia
  usuarios = $usuariosOut
  equipe = $equipeOut
  lancamentos = $lancamentos
  inconsistencias = $inconsistencias
  nfs = $nfsResumo
  operacional = $operacional
  timelines = $timelineOut
}

function Json-Escape([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return "" }
  return $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
}
function To-Json($o, [System.Text.StringBuilder]$sb) {
  if ($null -eq $o) { [void]$sb.Append("null"); return }
  $t = $o.GetType()
  if ($o -is [string]) { [void]$sb.Append('"'); [void]$sb.Append((Json-Escape $o)); [void]$sb.Append('"'); return }
  if ($o -is [bool] -or $t.FullName -eq "System.Boolean") { [void]$sb.Append($(if ($o) { "true" } else { "false" })); return }
  if ($o -is [byte] -or $o -is [int16] -or $o -is [int] -or $o -is [int64] -or $o -is [long] -or $o -is [double] -or $o -is [decimal] -or $o -is [single]) {
    [void]$sb.Append([Convert]::ToString($o, [Globalization.CultureInfo]::InvariantCulture)); return
  }
  if ($o -is [System.Collections.IDictionary]) {
    [void]$sb.Append("{")
    $first = $true
    foreach ($k in $o.Keys) {
      if (-not $first) { [void]$sb.Append(",") } else { $first = $false }
      [void]$sb.Append('"'); [void]$sb.Append((Json-Escape ([string]$k))); [void]$sb.Append('":')
      To-Json $o[$k] $sb
    }
    [void]$sb.Append("}")
    return
  }
  if ($o -is [System.Collections.IEnumerable]) {
    [void]$sb.Append("[")
    $first = $true
    foreach ($i in $o) {
      if (-not $first) { [void]$sb.Append(",") } else { $first = $false }
      To-Json $i $sb
    }
    [void]$sb.Append("]")
    return
  }
  To-Json ([string]$o) $sb
}

$sbJson = New-Object System.Text.StringBuilder 8000000
To-Json $payload $sbJson
$json = $sbJson.ToString()
[System.IO.File]::WriteAllText((Join-Path $base "dados.json"), $json, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $base "dados.js"), ("window.AUDITORIA = " + $json + ";`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host ("Eventos={0} | NFs entrada={1} | NFs inconsistentes={2} | Itens={3}" -f $payload.totais.eventos, $payload.totais.nfs_entrada, $payload.totais.nfs_inconsistentes, $payload.totais.itens_inconsistentes)
foreach ($t in $tiposArr) { Write-Host ("  {0}: {1}" -f $t.id, $t.qtd) }
$nfsCentral = @($lancamentos | Where-Object { $_.usuario_eh_central }).Count
Write-Host ("Central: {0} pessoas | NFs lancadas={1} de {2}" -f $equipeOut.Count, $nfsCentral, $nfsEntrada)
Write-Host "Gerado dados.json e dados.js"
