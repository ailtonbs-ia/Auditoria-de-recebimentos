#!/usr/bin/env python3
"""Extrai inconsistencias e eventos operacionais do log Consinco.

Uso: python parse_auditoria.py
Se python nao estiver no PATH: powershell -ExecutionPolicy Bypass -File parse_auditoria.ps1
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
TXT_CANDIDATES = [
    BASE / "auditoria central.txt",
    BASE / "auditoria_central.txt",
]
OUT_JSON = BASE / "dados.json"
OUT_JS = BASE / "dados.js"

COLS = [
    "seqaux",
    "nroempresa",
    "loja",
    "numeronf",
    "serienf",
    "seqpessoa",
    "fornecedor",
    "tiponf",
    "operacao",
    "produto",
    "diasprazo",
    "campo",
    "valor_antigo",
    "valor_novo",
    "datahora",
    "usuario",
    "terminal",
    "app",
    "versao",
    "chave",
]

RE_PRODUTO_MSG = re.compile(r"produto\s+(\d+)", re.IGNORECASE)
RE_PRODUTO_CAMPO = re.compile(r"^(\d+)\s*-\s*(.+)$")
RE_NUM = re.compile(r"(\d+(?:[.,]\d+)?)")
RE_UNIT_VENDA = re.compile(
    r"produto\s+(\d+)\s*\(([\d.,]+)\)\s+est[a�]\s+(acima|abaixo)\s+do\s+pre[c�]o\s+de\s+venda\s+\(([\d.,]+)\)",
    re.IGNORECASE,
)
RE_UNIT_CUSTO = re.compile(
    r"produto\s+(\d+).{0,40}est[a�]\s+(acima|abaixo)\s+do\s+custo.{0,40}limite:\s*([\d.,]+)",
    re.IGNORECASE,
)
RE_PEDIDO = re.compile(
    r"Valor total do item\s*\(([\d.,]+)\).{0,80}pedido.{0,40}\(([\d.,]+)\)\.\s*Valor original do Pedido\s*\(([\d.,]+)\)",
    re.IGNORECASE,
)
RE_LIMITE_PCT = re.compile(r"limite\s*\(%\)\s*=\s*\(([\d.,]+)\)", re.IGNORECASE)

SISTEMA_USERS = {"oracle", "system", "sys"}

CAMPOS_FISCAIS = (
    "valor icms",
    "valor total isento",
    "base de calculo icms",
    "base de c�lculo icms",
    "valor total do item",
    "valor pis",
    "valor cofins",
    "valor ipi",
    "al�quota",
    "aliquota",
)

CAMPOS_RUIDO = (
    "status de retorno da man",
    "mensagem retorno da man",
    "quantidade conferida",
    "nota em edi��o",
    "nota em edicao",
    "recalculou a tributa��o",
    "recalculou a tributacao",
    "c�digo ncm xml",
    "codigo ncm xml",
    "indica se",
    "n�mero empresa",
    "numero empresa",
    "n�mero da carga",
    "numero da carga",
    "data e hora lan�amento",
    "data e hora lancamento",
    "data vencimento",
    "confer�ncia de carga",
    "conferencia de carga",
)


def fold(text: str) -> str:
    return (
        (text or "")
        .casefold()
        .replace("�", "a")
        .replace("�", "a")
        .replace("�", "a")
        .replace("�", "a")
        .replace("�", "e")
        .replace("�", "e")
        .replace("�", "i")
        .replace("�", "o")
        .replace("�", "o")
        .replace("�", "o")
        .replace("�", "u")
        .replace("�", "c")
    )


def parse_br_number(raw: str | None) -> float | None:
    if not raw:
        return None
    txt = raw.strip().replace(" ", "")
    if not txt:
        return None
    if "," in txt and "." in txt:
        txt = txt.replace(".", "").replace(",", ".")
    elif "," in txt:
        txt = txt.replace(",", ".")
    try:
        return float(txt)
    except ValueError:
        return None


def parse_datahora(raw: str) -> tuple[str, str, str]:
    """Retorna (iso, data, hora) a partir de 2026-08-19-08.09.24.000000."""
    raw = (raw or "").strip()
    if not raw:
        return "", "", ""
    try:
        dt = datetime.strptime(raw[:19], "%Y-%m-%d-%H.%M.%S")
        return dt.strftime("%Y-%m-%dT%H:%M:%S"), dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
    except ValueError:
        return raw, raw[:10], ""


def split_produto(campo: str) -> tuple[str, str]:
    m = RE_PRODUTO_CAMPO.match((campo or "").strip())
    if m:
        return m.group(1), m.group(2).strip()
    return "", (campo or "").strip()


def find_txt() -> Path:
    for path in TXT_CANDIDATES:
        if path.exists():
            return path
    extras = sorted(BASE.glob("*.txt"))
    if extras:
        return extras[0]
    raise FileNotFoundError("Nenhum arquivo .txt encontrado na pasta.")


AUDIT_HEADER = (
    "SEQAUXNOTAFISCAL;NROEMPRESA;NOMEREDUZIDO;NUMERONF;SERIENF;"
    "SEQPESSOA;NOMEPESSOA;TIPNOTAFISCAL;OPERACAO;PRODUTO;DIASPRAZO;"
    "DESCGENERICA;VALORANTIGO;VALORNOVO;DTAHORALTERACAO;USUALTERACAO;"
    "TERMINALUSUALTERA;APPORIGEM;VERSAOSISTEMA;NFECHAVEACESSO"
)
RE_CHAVE_NFE = re.compile(r"^\d{44}$")
RE_CHAVE_SCI = re.compile(r"[eE][+-]?\d+")


def _first_line(path: Path) -> str:
    with path.open("r", encoding="cp1252", errors="replace", newline="") as fh:
        return fh.readline()


def is_audit_txt(path: Path) -> bool:
    header = _first_line(path).strip().upper().replace("\t", ";")
    return header.startswith("SEQAUXNOTAFISCAL")


def sniff_delim(header: str) -> str:
    if header.count("\t") >= 19:
        return "\t"
    return ";"


def split_audit_row(line: str, delim: str) -> list[str] | None:
    parts = line.rstrip("\r\n").split(delim)
    if len(parts) < 20:
        return None
    if len(parts) > 20:
        parts = parts[:19] + [delim.join(parts[19:])]
    return parts


def chave_nfe(raw: str) -> str:
    t = (raw or "").strip()
    if RE_CHAVE_SCI.search(t):
        return ""
    digits = re.sub(r"\D", "", t)
    if len(digits) >= 44:
        return digits[:44]
    return t if RE_CHAVE_NFE.match(t) else ""


def row_key(parts: list[str]) -> tuple[str, ...]:
    """Identidade da alteracao. Chave NFe entra so no desempate: export Excel corrompe NFECHAVEACESSO."""

    def g(i: int) -> str:
        return parts[i].strip() if i < len(parts) else ""

    return (g(0), g(8), g(9), g(11), g(12), g(13), g(14), g(15))


def row_melhor(atual: list[str], novo: list[str]) -> bool:
    ch_atual = chave_nfe(atual[19] if len(atual) > 19 else "")
    ch_novo = chave_nfe(novo[19] if len(novo) > 19 else "")
    return bool(ch_novo) and not ch_atual


def pastas_lotes() -> list[Path]:
    dirs = [BASE]
    seen = {BASE.resolve()}
    for name in ("Bases", "BASES"):
        pasta = BASE / name
        if pasta.is_dir():
            res = pasta.resolve()
            if res not in seen:
                seen.add(res)
                dirs.append(pasta)
    return dirs


def listar_lotes_auditoria() -> list[Path]:
    dest = TXT_CANDIDATES[0]
    dest_res = dest.resolve() if dest.exists() else None
    lotes: list[Path] = []
    seen: set[Path] = set()
    if dest.exists() and is_audit_txt(dest):
        lotes.append(dest)
        seen.add(dest.resolve())
    for pasta in pastas_lotes():
        for path in sorted(pasta.glob("*.txt"), key=lambda p: p.name.lower()):
            res = path.resolve()
            if dest_res and res == dest_res:
                continue
            if res in seen:
                continue
            if is_audit_txt(path):
                lotes.append(path)
                seen.add(res)
    return lotes


def consolidar_base() -> tuple[Path, int]:
    """Une TXTs de auditoria em auditoria central.txt (base 0), sem duplicar eventos."""
    dest = TXT_CANDIDATES[0]
    lotes = listar_lotes_auditoria()
    if not lotes:
        raise FileNotFoundError("Nenhum TXT de auditoria (cabecalho SEQAUXNOTAFISCAL) na pasta.")

    ordered: dict[tuple[str, ...], list[str]] = {}
    lidos = 0
    duplicados = 0
    for path in lotes:
        header = _first_line(path)
        delim = sniff_delim(header)
        with path.open("r", encoding="cp1252", errors="replace", newline="") as fh:
            first = True
            for line in fh:
                if first:
                    first = False
                    continue
                if not line.strip():
                    continue
                parts = split_audit_row(line, delim)
                if not parts:
                    continue
                if parts[0].strip().upper() == "SEQAUXNOTAFISCAL":
                    continue
                lidos += 1
                key = row_key(parts)
                if key in ordered:
                    duplicados += 1
                    if row_melhor(ordered[key], parts):
                        ordered[key] = parts
                    continue
                ordered[key] = parts

    tmp = dest.with_suffix(dest.suffix + ".tmp")
    with tmp.open("w", encoding="cp1252", errors="replace", newline="\r\n") as out:
        out.write(AUDIT_HEADER + "\n")
        for parts in ordered.values():
            out.write(";".join(parts) + "\n")
    os.replace(tmp, dest)
    print(
        f"Base 0: {len(ordered)} linhas unicas de {len(lotes)} lote(s) "
        f"({lidos} lidas, {duplicados} duplicatas ignoradas) -> {dest.name}"
    )
    return dest, len(lotes)


def parse_line(line: str) -> dict | None:
    parts = line.rstrip("\r\n").split(";")
    if len(parts) < 20:
        return None
    if len(parts) > 20:
        parts = parts[:19] + [";".join(parts[19:])]
    row = dict(zip(COLS, parts[:20]))
    if row["seqaux"] == "SEQAUXNOTAFISCAL" or not row["seqaux"]:
        return None
    row["iso"], row["data"], row["hora"] = parse_datahora(row["datahora"])
    codigo, nome = split_produto(row["produto"])
    row["produto_codigo"] = codigo
    row["produto_nome"] = nome
    return row


def classificar_regra(campo: str) -> str:
    t = fold(campo)
    if "pedido" in t:
        return "pedido"
    if "preco de venda" in t or "pre�o de venda" in t:
        return "venda_abaixo" if "abaixo" in t else "venda_acima"
    if "custo" in t:
        return "custo_abaixo" if "abaixo" in t else "custo_acima"
    return "outros"


def extrair_valores_regra(campo: str, tipo: str) -> dict:
    out = {
        "produto_codigo": "",
        "unitario": None,
        "referencia": None,
        "limite": None,
        "pedido_original": None,
        "pedido_limite": None,
    }
    m = RE_PRODUTO_MSG.search(campo or "")
    if m:
        out["produto_codigo"] = m.group(1)

    mv = RE_UNIT_VENDA.search(campo or "")
    if mv:
        out["produto_codigo"] = mv.group(1)
        out["unitario"] = parse_br_number(mv.group(2))
        out["referencia"] = parse_br_number(mv.group(4))

    mc = RE_UNIT_CUSTO.search(campo or "")
    if mc:
        out["produto_codigo"] = mc.group(1)
        out["limite"] = parse_br_number(mc.group(3))

    mp = RE_PEDIDO.search(campo or "")
    if mp:
        out["unitario"] = parse_br_number(mp.group(1))
        out["pedido_limite"] = parse_br_number(mp.group(2))
        out["pedido_original"] = parse_br_number(mp.group(3))
        out["referencia"] = out["pedido_original"]

    lp = RE_LIMITE_PCT.search(campo or "")
    if lp:
        out["limite"] = parse_br_number(lp.group(1))
    return out


def eh_meta_ai(campo: str) -> str | None:
    t = fold(campo)
    if "usuario de aceite" in t:
        return "aceite_usuario"
    if "justific" in t:
        return "justificativa"
    return None


def eh_fiscal(campo: str) -> bool:
    t = fold(campo)
    return any(c in t for c in CAMPOS_FISCAIS)


def eh_ruido(campo: str) -> bool:
    t = fold(campo)
    return any(c in t for c in CAMPOS_RUIDO)


def eh_loja_fora(loja: str, nro: str = "") -> bool:
    l = (loja or "").strip().upper()
    return l.startswith("C001") or l.startswith("R066")


def eh_forn_331(seqpessoa: str = "", fornecedor: str = "") -> bool:
    if (seqpessoa or "").strip() == "331":
        return True
    f = (fornecedor or "").strip()
    return f == "331" or f.startswith("331 ") or f.startswith("331-")


def norm_codigo(raw: str | None) -> str:
    t = (raw or "").strip()
    if re.fullmatch(r"\d+\.0+", t):
        t = t.split(".")[0]
    n = t.lstrip("0")
    return n or t


def eh_central_grupo(grupo: str) -> bool:
    return "central de recebimento" in fold(grupo)


def load_usuarios(base: Path) -> tuple[dict[str, dict], list[dict], str]:
    files = sorted(base.glob("*Usuario*.xlsx")) or sorted(base.glob("*.xlsx"))
    mapa: dict[str, dict] = {}
    equipe: list[dict] = []
    if not files:
        print("Lista de usuarios .xlsx nao encontrada; monitoramento segue so com codigos.")
        return mapa, equipe, ""
    src = files[0]
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(src) as zf:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", ns):
                texts = [t.text or "" for t in si.findall(".//m:t", ns)]
                strings.append("".join(texts))
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        seen_eq: set[str] = set()
        total = 0
        for row in sheet.findall("m:sheetData/m:row", ns):
            cells: dict[str, str] = {}
            for c in row.findall("m:c", ns):
                ref = c.get("r") or ""
                m = re.match(r"([A-Z]+)", ref)
                col = m.group(1) if m else ""
                v_el = c.find("m:v", ns)
                v = v_el.text if v_el is not None and v_el.text else ""
                if c.get("t") == "s" and v.isdigit():
                    idx = int(v)
                    v = strings[idx] if idx < len(strings) else v
                cells[col] = v
            codigo_raw = cells.get("B", "")
            nome = (cells.get("C") or "").strip()
            grupo = (cells.get("D") or "").strip()
            codigo = norm_codigo(codigo_raw)
            if not codigo:
                continue
            if fold(codigo_raw) == "usuario" or fold(nome) == "nome":
                continue
            info = {
                "codigo": codigo,
                "nome": nome or codigo,
                "grupo": grupo,
                "eh_central": eh_central_grupo(grupo),
                "cadastrado": True,
            }
            mapa[codigo] = info
            if info["eh_central"] and codigo not in seen_eq:
                seen_eq.add(codigo)
                equipe.append(info)
            total += 1
    print(f"Usuarios na planilha {src.name}: {total} | Central: {len(equipe)}")
    return mapa, equipe, src.name


def info_usuario(codigo: str, mapa: dict[str, dict]) -> dict:
    n = norm_codigo(codigo)
    if n and n in mapa:
        return mapa[n]
    raw = (codigo or "").strip()
    if raw and raw in mapa:
        return mapa[raw]
    return {"codigo": n or raw, "nome": raw, "grupo": "", "eh_central": False, "cadastrado": False}


def nf_key(row: dict) -> str:
    return f"{row['seqaux']}|{row['chave']}"


def rank(counter: dict[str, int], limit: int = 12) -> list[dict]:
    items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"nome": k, "qtd": v} for k, v in items[:limit] if k]


def build_timeline_event(row: dict, tipo: str, detalhe: str, mapa: dict[str, dict] | None = None) -> dict:
    u = info_usuario(row.get("usuario") or "", mapa or {})
    return {
        "iso": row["iso"],
        "data": row["data"],
        "hora": row["hora"],
        "operacao": row["operacao"],
        "tipo": tipo,
        "produto": row["produto"],
        "campo": row["campo"],
        "valor_antigo": row["valor_antigo"],
        "valor_novo": row["valor_novo"],
        "usuario": row["usuario"],
        "usuario_nome": u["nome"],
        "usuario_grupo": u["grupo"],
        "usuario_eh_central": u["eh_central"],
        "detalhe": detalhe,
    }


def parse(path: Path) -> dict:
    usuarios_mapa, equipe, usuarios_arquivo = load_usuarios(BASE)
    nfs: dict[str, dict] = {}
    produtos_por_nf: dict[str, dict[str, str]] = defaultdict(dict)
    volume_lojas: dict[str, int] = defaultdict(int)
    volume_dias: dict[str, int] = defaultdict(int)
    lojas_set: dict[str, str] = {}
    fornecedores_set: set[str] = set()
    usuarios_set: set[str] = set()
    total_eventos = 0
    total_in = 0
    ops_count: dict[str, int] = defaultdict(int)

    inconsistencias: list[dict] = []
    operacional: list[dict] = []
    lancamentos: list[dict] = []
    timelines: dict[str, list[dict]] = defaultdict(list)
    aceite_meta: dict[str, dict] = defaultdict(lambda: {"usuario": "", "justificativa": "", "status": ""})

    with path.open("r", encoding="cp1252", errors="replace", newline="") as fh:
        for line in fh:
            row = parse_line(line)
            if not row:
                continue
            if eh_loja_fora(row.get("loja", ""), row.get("nroempresa", "")):
                continue
            if eh_forn_331(row.get("seqpessoa", ""), row.get("fornecedor", "")):
                continue
            total_eventos += 1
            op = (row["operacao"] or "").strip().upper()
            ops_count[op] += 1
            key = nf_key(row)
            lojas_set[row["nroempresa"]] = row["loja"]
            if row["fornecedor"]:
                fornecedores_set.add(row["fornecedor"])
            user = (row["usuario"] or "").strip()
            if user and fold(user) not in SISTEMA_USERS:
                usuarios_set.add(user)

            header = nfs.setdefault(
                key,
                {
                    "id": key,
                    "seqaux": row["seqaux"],
                    "nroempresa": row["nroempresa"],
                    "loja": row["loja"],
                    "numeronf": row["numeronf"],
                    "serienf": row["serienf"],
                    "seqpessoa": row["seqpessoa"],
                    "fornecedor": row["fornecedor"],
                    "chave": row["chave"],
                    "tem_in": False,
                    "tem_en": False,
                    "primeira": row["iso"],
                    "ultima": row["iso"],
                },
            )
            if row["iso"] and (not header["primeira"] or row["iso"] < header["primeira"]):
                header["primeira"] = row["iso"]
            if row["iso"] and row["iso"] > header["ultima"]:
                header["ultima"] = row["iso"]
            if row["loja"] and not header["loja"]:
                header["loja"] = row["loja"]
            if row["fornecedor"] and not header["fornecedor"]:
                header["fornecedor"] = row["fornecedor"]

            if row["produto_codigo"]:
                produtos_por_nf[key][row["produto_codigo"]] = row["produto_nome"] or row["produto"]

            if op == "IN":
                total_in += 1
                if not header["tem_in"]:
                    header["tem_in"] = True
                    header["usuario_in"] = row["usuario"]
                    volume_lojas[row["loja"] or row["nroempresa"]] += 1
                    if row["data"]:
                        volume_dias[row["data"]] += 1
                    lancamentos.append(
                        {
                            "nf_id": key,
                            "seqaux": row["seqaux"],
                            "nroempresa": row["nroempresa"],
                            "loja": row["loja"],
                            "numeronf": row["numeronf"],
                            "serienf": row["serienf"],
                            "fornecedor": row["fornecedor"],
                            "chave": row["chave"],
                            "iso": row["iso"],
                            "data": row["data"],
                            "hora": row["hora"],
                            "usuario": row["usuario"],
                        }
                    )
                timelines[key].append(build_timeline_event(row, "inclusao", "Inclusao da nota", usuarios_mapa))

            elif op == "EN":
                header["tem_en"] = True
                operacional.append(
                    {
                        "id": f"{key}|EN|{row['iso']}|{total_eventos}",
                        "seqaux": row["seqaux"],
                        "nroempresa": row["nroempresa"],
                        "loja": row["loja"],
                        "numeronf": row["numeronf"],
                        "serienf": row["serienf"],
                        "fornecedor": row["fornecedor"],
                        "chave": row["chave"],
                        "tipo": "exclusao_nf",
                        "produto": "",
                        "campo": "Exclus�o da nota",
                        "valor_antigo": row["valor_antigo"],
                        "valor_novo": row["valor_novo"],
                        "iso": row["iso"],
                        "data": row["data"],
                        "hora": row["hora"],
                        "usuario": row["usuario"],
                    }
                )
                timelines[key].append(build_timeline_event(row, "exclusao_nf", "Exclus�o da nota"))

            elif op == "EP":
                operacional.append(
                    {
                        "id": f"{key}|EP|{row['produto_codigo']}|{row['iso']}|{total_eventos}",
                        "seqaux": row["seqaux"],
                        "nroempresa": row["nroempresa"],
                        "loja": row["loja"],
                        "numeronf": row["numeronf"],
                        "serienf": row["serienf"],
                        "fornecedor": row["fornecedor"],
                        "chave": row["chave"],
                        "tipo": "exclusao_produto",
                        "produto": row["produto"],
                        "produto_codigo": row["produto_codigo"],
                        "campo": row["campo"] or "Exclus�o de produto",
                        "valor_antigo": row["valor_antigo"],
                        "valor_novo": row["valor_novo"],
                        "iso": row["iso"],
                        "data": row["data"],
                        "hora": row["hora"],
                        "usuario": row["usuario"],
                    }
                )
                timelines[key].append(
                    build_timeline_event(row, "exclusao_produto", row["produto"] or "Exclus�o de produto")
                )

            elif op == "AI":
                meta = eh_meta_ai(row["campo"])
                if meta == "aceite_usuario":
                    aceite_meta[key]["usuario"] = row["valor_novo"] or row["valor_antigo"] or row["usuario"]
                    timelines[key].append(
                        build_timeline_event(row, "aceite", f"Usu�rio de aceite: {aceite_meta[key]['usuario']}")
                    )
                elif meta == "justificativa":
                    just = row["valor_novo"] or row["valor_antigo"]
                    if just:
                        aceite_meta[key]["justificativa"] = just
                    timelines[key].append(
                        build_timeline_event(row, "justificativa", just or "Justificativa")
                    )
                else:
                    tipo = classificar_regra(row["campo"])
                    vals = extrair_valores_regra(row["campo"], tipo)
                    status = row["valor_novo"] or row["valor_antigo"] or ""
                    if fold(row["valor_antigo"]) == "nota inconsistente" or "inconsist" in fold(status):
                        aceite_meta[key]["status"] = status
                    codigo = vals["produto_codigo"] or row["produto_codigo"]
                    nome = produtos_por_nf[key].get(codigo, row["produto_nome"])
                    inconsistencias.append(
                        {
                            "id": f"{key}|AI|{codigo}|{row['iso']}|{total_eventos}",
                            "nf_id": key,
                            "seqaux": row["seqaux"],
                            "nroempresa": row["nroempresa"],
                            "loja": row["loja"],
                            "numeronf": row["numeronf"],
                            "serienf": row["serienf"],
                            "fornecedor": row["fornecedor"],
                            "chave": row["chave"],
                            "tipo": tipo,
                            "status": status,
                            "mensagem": row["campo"],
                            "produto_codigo": codigo,
                            "produto_nome": nome,
                            "produto": f"{codigo} - {nome}".strip(" -") if codigo or nome else "",
                            "unitario": vals["unitario"],
                            "referencia": vals["referencia"],
                            "limite": vals["limite"],
                            "pedido_original": vals["pedido_original"],
                            "pedido_limite": vals["pedido_limite"],
                            "valor_antigo": row["valor_antigo"],
                            "valor_novo": row["valor_novo"],
                            "iso": row["iso"],
                            "data": row["data"],
                            "hora": row["hora"],
                            "usuario": row["usuario"],
                            "aceite_usuario": "",
                            "justificativa": "",
                        }
                    )
                    timelines[key].append(build_timeline_event(row, tipo, row["campo"]))

            elif op == "AP":
                pass  # recalculo tributario gera ruido; operacional fica EN/EP

            elif op in {"IV", "EV"}:
                detalhe = "Vencimento" if op == "IV" else "Exclus�o de vencimento"
                timelines[key].append(build_timeline_event(row, "vencimento", detalhe))

    for item in inconsistencias:
        meta = aceite_meta.get(item["nf_id"], {})
        item["aceite_usuario"] = meta.get("usuario") or item["usuario"]
        item["justificativa"] = meta.get("justificativa") or ""
        if not item["status"]:
            item["status"] = meta.get("status") or ""
        if item["produto_codigo"] and not item["produto_nome"]:
            item["produto_nome"] = produtos_por_nf[item["nf_id"]].get(item["produto_codigo"], "")
            if item["produto_nome"]:
                item["produto"] = f"{item['produto_codigo']} - {item['produto_nome']}"
        u_exec = info_usuario(item["usuario"], usuarios_mapa)
        item["usuario_nome"] = u_exec["nome"]
        item["usuario_grupo"] = u_exec["grupo"]
        item["usuario_eh_central"] = u_exec["eh_central"]
        u_ace = info_usuario(item["aceite_usuario"], usuarios_mapa)
        item["aceite_nome"] = u_ace["nome"]
        item["aceite_grupo"] = u_ace["grupo"]
        item["aceite_eh_central"] = u_ace["eh_central"]

    for ev in operacional:
        u = info_usuario(ev["usuario"], usuarios_mapa)
        ev["usuario_nome"] = u["nome"]
        ev["usuario_grupo"] = u["grupo"]
        ev["usuario_eh_central"] = u["eh_central"]
    for ev in lancamentos:
        u = info_usuario(ev["usuario"], usuarios_mapa)
        ev["usuario_nome"] = u["nome"]
        ev["usuario_grupo"] = u["grupo"]
        ev["usuario_eh_central"] = u["eh_central"]
    for evs in timelines.values():
        for ev in evs:
            u = info_usuario(ev.get("usuario") or "", usuarios_mapa)
            ev["usuario_nome"] = u["nome"]
            ev["usuario_grupo"] = u["grupo"]
            ev["usuario_eh_central"] = u["eh_central"]

    nf_com_inc = {item["nf_id"] for item in inconsistencias}
    nf_ops = {ev["seqaux"] + "|" + ev["chave"] for ev in operacional}

    keep_ids = nf_com_inc
    timeline_out = {}
    for key in keep_ids:
        events = sorted(timelines.get(key, []), key=lambda e: (e["iso"], e["operacao"]))
        # Evita timelines gigantes: tira duplicata imediata
        compact = []
        seen = set()
        for ev in events:
            sig = (ev["iso"], ev["operacao"], ev["campo"], ev["valor_antigo"], ev["valor_novo"], ev["produto"])
            if sig in seen:
                continue
            seen.add(sig)
            compact.append(ev)
        timeline_out[key] = compact[:120]

    nfs_resumo = []
    for key in sorted(nf_com_inc):
        h = nfs[key]
        itens = [i for i in inconsistencias if i["nf_id"] == key]
        tipos = sorted({i["tipo"] for i in itens})
        nfs_resumo.append(
            {
                "id": key,
                "seqaux": h["seqaux"],
                "loja": h["loja"],
                "nroempresa": h["nroempresa"],
                "numeronf": h["numeronf"],
                "serienf": h["serienf"],
                "fornecedor": h["fornecedor"],
                "chave": h["chave"],
                "qtd_itens": len(itens),
                "tipos": tipos,
                "aceite_usuario": itens[0]["aceite_usuario"] if itens else "",
                "aceite_nome": itens[0].get("aceite_nome", "") if itens else "",
                "aceite_grupo": itens[0].get("aceite_grupo", "") if itens else "",
                "aceite_eh_central": itens[0].get("aceite_eh_central", False) if itens else False,
                "justificativa": itens[0]["justificativa"] if itens else "",
                "status": itens[0]["status"] if itens else "",
                "iso": itens[0]["iso"] if itens else h["ultima"],
                "data": itens[0]["data"] if itens else "",
            }
        )

    tipo_count: dict[str, int] = defaultdict(int)
    loja_inc: dict[str, int] = defaultdict(int)
    forn_inc: dict[str, int] = defaultdict(int)
    prod_inc: dict[str, int] = defaultdict(int)
    user_inc: dict[str, int] = defaultdict(int)
    just_inc: dict[str, int] = defaultdict(int)
    status_inc: dict[str, int] = defaultdict(int)
    dia_inc: dict[str, int] = defaultdict(int)

    nfs_por_tipo_loja: dict[str, set] = defaultdict(set)
    for item in inconsistencias:
        tipo_count[item["tipo"]] += 1
        loja_inc[item["loja"]] += 1
        forn_inc[item["fornecedor"]] += 1
        prod_inc[item["produto"] or item["produto_codigo"] or "sem produto"] += 1
        user_inc[item.get("aceite_nome") or item["aceite_usuario"] or item["usuario"]] += 1
        just = (item["justificativa"] or "").strip()
        if just.lower() != "ok":
            just_inc[just or "(sem justificativa)"] += 1
        status_inc[item["status"] or "(sem status)"] += 1
        if item["data"]:
            dia_inc[item["data"]] += 1
        nfs_por_tipo_loja[item["loja"]].add(item["nf_id"])

    loja_nf_inc = {k: len(v) for k, v in nfs_por_tipo_loja.items()}
    ranking_loja = []
    for nome, qtd_nf in sorted(loja_nf_inc.items(), key=lambda kv: (-kv[1], kv[0])):
        total_loja = volume_lojas.get(nome, 0)
        ranking_loja.append(
            {
                "nome": nome,
                "nfs_inconsistentes": qtd_nf,
                "itens": loja_inc.get(nome, 0),
                "nfs_entrada": total_loja,
                "taxa": round((qtd_nf / total_loja) * 100, 1) if total_loja else None,
            }
        )

    datas = sorted({d for d in list(volume_dias) + list(dia_inc) if d})
    por_dia = [
        {
            "data": d,
            "nfs_entrada": volume_dias.get(d, 0),
            "itens_inconsistentes": dia_inc.get(d, 0),
            "nfs_inconsistentes": len({i["nf_id"] for i in inconsistencias if i["data"] == d}),
        }
        for d in datas
    ]

    usuarios_out: dict[str, dict] = {}
    for code in usuarios_set:
        info = info_usuario(code, usuarios_mapa)
        if info["codigo"]:
            usuarios_out[info["codigo"]] = info
    for item in inconsistencias:
        for code in (item.get("usuario"), item.get("aceite_usuario")):
            info = info_usuario(code or "", usuarios_mapa)
            if info["codigo"]:
                usuarios_out[info["codigo"]] = info
    equipe_out = []
    seen_eq: set[str] = set()
    for m in equipe:
        if m["codigo"] in seen_eq:
            continue
        seen_eq.add(m["codigo"])
        usuarios_out[m["codigo"]] = m
        equipe_out.append({"codigo": m["codigo"], "nome": m["nome"], "grupo": m["grupo"], "eh_central": True})

    nfs_entrada = len([h for h in nfs.values() if h["tem_in"]])
    return {
        "gerado_em": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "arquivo": path.name,
        "usuarios_arquivo": usuarios_arquivo,
        "periodo": {"inicio": datas[0] if datas else "", "fim": datas[-1] if datas else ""},
        "totais": {
            "eventos": total_eventos,
            "nfs_entrada": nfs_entrada,
            "inclusoes_in": total_in,
            "nfs_inconsistentes": len(nf_com_inc),
            "itens_inconsistentes": len(inconsistencias),
            "exclusoes_nf": ops_count.get("EN", 0),
            "exclusoes_produto": ops_count.get("EP", 0),
            "alteracoes_fiscais": sum(1 for e in operacional if e["tipo"] == "alteracao_fiscal"),
            "operacionais": len(operacional),
            "taxa_nfs": round((len(nf_com_inc) / max(nfs_entrada, 1)) * 100, 2),
            "equipe_central": len(equipe_out),
        },
        "operacoes": dict(sorted(ops_count.items())),
        "tipos": [{"id": k, "qtd": tipo_count[k]} for k in ["custo_acima", "custo_abaixo", "venda_acima", "venda_abaixo", "pedido", "outros"] if tipo_count.get(k)],
        "status": rank(status_inc, 10),
        "filtros": {
            "lojas": sorted(lojas_set.values()),
            "fornecedores": sorted(fornecedores_set),
            "usuarios": sorted(usuarios_set),
            "datas": datas,
            "tipos": [t["id"] for t in [{"id": k, "qtd": tipo_count[k]} for k in ["custo_acima", "custo_abaixo", "venda_acima", "venda_abaixo", "pedido", "outros"] if tipo_count.get(k)]],
        },
        "rankings": {
            "lojas": ranking_loja[:15],
            "fornecedores": rank(forn_inc, 12),
            "produtos": rank(prod_inc, 12),
            "usuarios": rank(user_inc, 12),
            "justificativas": rank(just_inc, 12),
        },
        "por_dia": por_dia,
        "usuarios": usuarios_out,
        "equipe": equipe_out,
        "lancamentos": lancamentos,
        "inconsistencias": sorted(inconsistencias, key=lambda i: (i["iso"], i["loja"], i["numeronf"]), reverse=True),
        "nfs": sorted(nfs_resumo, key=lambda n: (n["iso"], n["loja"]), reverse=True),
        "operacional": sorted(operacional, key=lambda e: (e["iso"], e["loja"]), reverse=True),
        "timelines": timeline_out,
    }


def main() -> int:
    n_lotes = 0
    if len(sys.argv) > 1:
        path = Path(sys.argv[1]).resolve()
    else:
        path, n_lotes = consolidar_base()
    print(f"Lendo {path} ...")
    payload = parse(path)
    if n_lotes:
        payload["arquivo"] = f"{path.name} ({n_lotes} lotes)"
    t = payload["totais"]
    print(
        f"Eventos={t['eventos']} | NFs entrada={t['nfs_entrada']} | "
        f"NFs inconsistentes={t['nfs_inconsistentes']} | Itens={t['itens_inconsistentes']}"
    )
    for tipo in payload["tipos"]:
        print(f"  {tipo['id']}: {tipo['qtd']}")
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_JS.write_text(
        "window.AUDITORIA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Gerado {OUT_JSON.name} e {OUT_JS.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
