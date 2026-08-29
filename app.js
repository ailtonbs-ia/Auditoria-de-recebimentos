const TIPO_LABEL = {
  custo_acima: "Custo acima do medio",
  custo_abaixo: "Custo abaixo do medio",
  venda_acima: "Acima do preco de venda",
  venda_abaixo: "Abaixo do preco de venda",
  pedido: "Divergencia de pedido",
  outros: "Outros",
  exclusao_nf: "Exclusao de NF",
  exclusao_produto: "Exclusao de produto",
  alteracao_fiscal: "Alteracao fiscal",
  inclusao_nf: "Inclusao de NF",
};

const SEGMENTO_LABEL = {
  LOJAS: "Lojas",
  EMPORIOS: "Emporios",
  MERCEARIA: "Mercearias",
  CD: "CD",
  BARRA: "Barra",
  AGRO: "Agro",
};

const SEGMENTO_SHORT = {
  LOJAS: "Loja",
  EMPORIOS: "Emporio",
  MERCEARIA: "Mercearia",
};

const SEGMENTOS_COBERTURA = ["LOJAS", "EMPORIOS", "MERCEARIA"];

const $ = (id) => document.getElementById(id);
const dash = "-";
const fmt = (n) => (n == null || n === "" ? dash : Number(n).toLocaleString("pt-BR"));
const fmtPct = (n) => (n == null ? dash : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function mixRgb(from, to, t) {
  const p = clamp(t, 0, 1);
  return from.map((c, i) => Math.round(c + (to[i] - c) * p));
}

function metaColor(pct, meta) {
  const p = clamp((Number(pct) || 0) / (meta || 100), 0, 1);
  const red = [227, 27, 35];
  const yellow = [230, 184, 77];
  const green = [61, 207, 142];
  const rgb = p < 0.5 ? mixRgb(red, yellow, p / 0.5) : mixRgb(yellow, green, (p - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function metaTone(pct, meta) {
  const p = clamp((Number(pct) || 0) / (meta || 100), 0, 1);
  if (p >= 0.7) return "good";
  if (p >= 0.4) return "warn";
  return "bad";
}

function metaColorDown(pct, redAt) {
  const p = clamp((Number(pct) || 0) / (redAt || 100), 0, 1);
  return metaColor((1 - p) * 100, 100);
}

function metaToneDown(pct, redAt) {
  const p = clamp((Number(pct) || 0) / (redAt || 100), 0, 1);
  return metaTone((1 - p) * 100, 100);
}
const fmtData = (d) => {
  if (!d) return dash;
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
};

function todayLabel() {
  const raw = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function setTodayDate() {
  const el = $("todayDate");
  if (el) el.textContent = todayLabel();
}

function fmtPeriodo(inicio, fim) {
  const a = String(inicio || "").split("-");
  const b = String(fim || "").split("-");
  if (a.length < 3 && b.length < 3) return "";
  if (a.length < 3) return `Dados de ${fmtData(fim)}`;
  if (b.length < 3) return `Dados de ${fmtData(inicio)}`;
  if (inicio === fim) return `Dados de ${fmtData(fim)}`;
  if (a[0] === b[0]) return `Dados de ${a[2]}/${a[1]} a ${b[2]}/${b[1]}/${b[0]}`;
  return `Dados de ${fmtData(inicio)} a ${fmtData(fim)}`;
}

function fmtDateTime(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]} as ${m[4]}:${m[5]}`;
}

function metaLabel(data) {
  const p = (data && data.periodo) || {};
  const parts = [];
  if (p.inicio && p.fim && p.inicio !== p.fim) parts.push(`Periodo ${fmtData(p.inicio)} a ${fmtData(p.fim)}`);
  else if (p.inicio || p.fim) parts.push(`Periodo ${fmtData(p.inicio || p.fim)}`);
  const when = fmtDateTime(data && data.gerado_em);
  if (when) parts.push(`Atualizado em ${when}`);
  return parts.join("  ·  ") || "Central de Recebimentos";
}

let DATA = null;
let TAB = "central";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prettyName(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}


function normUser(s) {
  const t = String(s || "").trim();
  const n = t.replace(/^0+/, "");
  return n || t;
}

function userInfo(code) {
  const n = normUser(code);
  const map = DATA.usuarios || {};
  const hit = map[n] || map[String(code || "").trim()];
  if (hit) {
    return {
      codigo: hit.codigo || n,
      nome: prettyName(hit.nome || code),
      grupo: hit.grupo || "",
      eh_central: !!hit.eh_central,
      cadastrado: hit.cadastrado !== false,
    };
  }
  const equipe = (DATA.equipe || []).find((m) => normUser(m.codigo) === n);
  if (equipe) {
    return {
      codigo: equipe.codigo,
      nome: prettyName(equipe.nome),
      grupo: equipe.grupo || "Central de Recebimento",
      eh_central: true,
      cadastrado: true,
    };
  }
  return { codigo: n, nome: prettyName(code) || n, grupo: "", eh_central: false, cadastrado: false };
}

function userLabel(code) {
  if (!code) return dash;
  const u = userInfo(code);
  return u.nome || String(code);
}

function grupoLabel(code, fallbackGrupo) {
  const g = fallbackGrupo || userInfo(code).grupo;
  if (!g) return "Nao cadastrado";
  if (/central de recebimento/i.test(g)) return "Central";
  return g;
}

function isCentralCode(code, fallback) {
  if (fallback === true || fallback === false) return fallback;
  return userInfo(code).eh_central;
}

function badge(tipo) {
  return `<span class="badge t-${esc(tipo)}">${esc(TIPO_LABEL[tipo] || tipo)}</span>`;
}

function fillSelect(id, values, blank, labels) {
  const el = $(id);
  const cur = el.value;
  el.innerHTML =
    `<option value="">${blank}</option>` +
    values.map((v) => `<option value="${esc(v)}">${esc((labels && labels[v]) || v)}</option>`).join("");
  el.value = values.includes(cur) ? cur : "";
}

function isLojaFora(loja) {
  const l = String(loja || "")
    .trim()
    .toUpperCase();
  return l.startsWith("C001") || l.startsWith("R066");
}

function segmentoLabel(seg) {
  return SEGMENTO_LABEL[seg] || seg || dash;
}

function empresaInfo(item) {
  const nro = String((item && item.nroempresa) || "").trim();
  const nroNorm = nro.replace(/^0+/, "") || nro;
  const loja = String((item && (typeof item === "string" ? item : item.loja)) || "").trim();
  const map = (DATA && DATA.empresas) || {};
  const byLoja = (DATA && DATA.empresas_loja) || {};
  return map[nroNorm] || map[nro] || byLoja[loja] || { nroempresa: nroNorm, loja, segmento: (item && item.segmento) || "" };
}

function segmentoOf(item) {
  if (item && item.segmento) return item.segmento;
  return empresaInfo(item).segmento || "";
}

function segTag(seg) {
  if (!seg) return "";
  const cls = String(seg).toLowerCase();
  return `<span class="seg-tag seg-${esc(cls)}">${esc(SEGMENTO_SHORT[seg] || segmentoLabel(seg))}</span>`;
}

function coberturaLista() {
  const cadastro = (DATA && DATA.cobertura) || [];
  if (cadastro.length) return cadastro.filter((e) => e.loja && !isLojaFora(e.loja));
  return ((DATA.filtros && DATA.filtros.lojas) || [])
    .filter((l) => l && !isLojaFora(l))
    .map((loja) => ({ loja, nroempresa: "", segmento: segmentoOf({ loja }) || "LOJAS" }));
}

function lojasDoFiltro() {
  const seg = ($("f-segmento") && $("f-segmento").value) || "";
  return ((DATA.filtros && DATA.filtros.lojas) || [])
    .filter((l) => l && !isLojaFora(l))
    .filter((l) => !seg || segmentoOf({ loja: l }) === seg);
}

function fillSelectLojas() {
  const el = $("f-loja");
  if (!el) return;
  const cur = el.value;
  const lojas = lojasDoFiltro();
  const groups = { LOJAS: [], EMPORIOS: [], MERCEARIA: [], OUTROS: [] };
  lojas.forEach((l) => {
    const s = segmentoOf({ loja: l });
    (groups[s] || groups.OUTROS).push(l);
  });
  const order = SEGMENTOS_COBERTURA.concat(["OUTROS"]);
  const parts = [`<option value="">Todas as unidades</option>`];
  const used = order.filter((s) => (groups[s] || []).length);
  used.forEach((s) => {
    const label = s === "OUTROS" ? "Outros" : segmentoLabel(s);
    if (used.length > 1) parts.push(`<optgroup label="${esc(label)}">`);
    groups[s].forEach((v) => parts.push(`<option value="${esc(v)}">${esc(v)}</option>`));
    if (used.length > 1) parts.push(`</optgroup>`);
  });
  el.innerHTML = parts.join("");
  el.value = lojas.includes(cur) ? cur : "";
}

function isForn331(item) {
  const seq = String((item && (item.seqpessoa || item.seq_pessoa)) || "").trim();
  if (seq === "331") return true;
  const nome = typeof item === "string" ? item : (item && item.fornecedor) || "";
  const f = String(nome || "").trim();
  return f === "331" || f.startsWith("331 ") || f.startsWith("331-");
}

function filters() {
  return {
    q: $("q").value.trim().toLowerCase(),
    data: $("f-data").value,
    loja: $("f-loja").value,
    forn: $("f-forn").value,
    tipo: $("f-tipo").value,
    segmento: ($("f-segmento") && $("f-segmento").value) || "",
    grupo: "",
    user: "",
  };
}

function matchGrupo(ehCentral, grupoFiltro) {
  if (!grupoFiltro) return true;
  if (grupoFiltro === "central") return !!ehCentral;
  if (grupoFiltro === "lojas") return !ehCentral;
  return true;
}

function matchUser(code, wanted) {
  if (!wanted) return true;
  return normUser(code) === normUser(wanted);
}

function matchText(item, q) {
  if (!q) return true;
  const blob = [
    item.numeronf,
    item.serienf,
    item.chave,
    item.loja,
    item.segmento,
    item.fornecedor,
    item.produto,
    item.produto_codigo,
    item.produto_nome,
    item.mensagem,
    item.justificativa,
    item.aceite_usuario,
    item.aceite_nome,
    item.aceite_grupo,
    item.usuario,
    item.usuario_nome,
    item.usuario_grupo,
    item.campo,
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function matchBase(item, f) {
  if (isLojaFora(item.loja)) return false;
  if (isForn331(item)) return false;
  if (f.data && item.data !== f.data) return false;
  if (f.loja && item.loja !== f.loja) return false;
  if (f.forn && item.fornecedor !== f.forn) return false;
  if (f.segmento && segmentoOf(item) !== f.segmento) return false;
  return matchText(item, f.q);
}

function filteredInc(opts) {
  const f = filters();
  const skipPerson = opts && opts.skipPerson;
  return DATA.inconsistencias.filter((i) => {
    if (!matchBase(i, f)) return false;
    if (f.tipo && i.tipo !== f.tipo) return false;
    if (!skipPerson) {
      const ace = i.aceite_usuario || i.usuario;
      if (!matchGrupo(i.aceite_eh_central ?? isCentralCode(ace), f.grupo)) return false;
      if (!matchUser(ace, f.user) && !matchUser(i.usuario, f.user)) return false;
    }
    return true;
  });
}

function filteredOps(opts) {
  const f = filters();
  const skipPerson = opts && opts.skipPerson;
  return DATA.operacional.filter((i) => {
    if (!matchBase(i, f)) return false;
    if (f.tipo && i.tipo !== f.tipo) return false;
    if (!skipPerson) {
      if (!matchGrupo(i.usuario_eh_central ?? isCentralCode(i.usuario), f.grupo)) return false;
      if (!matchUser(i.usuario, f.user)) return false;
    }
    return true;
  });
}

function filteredLanc(opts) {
  const f = filters();
  const skipPerson = opts && opts.skipPerson;
  return (DATA.lancamentos || []).filter((i) => {
    if (!matchBase(i, f)) return false;
    if (!skipPerson) {
      if (!matchGrupo(i.usuario_eh_central ?? isCentralCode(i.usuario), f.grupo)) return false;
      if (!matchUser(i.usuario, f.user)) return false;
    }
    return true;
  });
}

function shortName(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "..." : t;
}

function execStats() {
  const inc = filteredInc();
  const lanc = filteredLanc({ skipPerson: true });
  const volume = {};
  lanc.forEach((r) => {
    if (r.loja) volume[r.loja] = (volume[r.loja] || 0) + 1;
  });
  const lojaItens = {};
  const lojaNfs = {};
  const tipoItens = {};
  const tipoNfs = {};
  const fornItens = {};
  const fornNfs = {};
  inc.forEach((i) => {
    const loja = i.loja || "sem loja";
    const tipo = i.tipo || "outros";
    const forn = i.fornecedor || "sem fornecedor";
    lojaItens[loja] = (lojaItens[loja] || 0) + 1;
    tipoItens[tipo] = (tipoItens[tipo] || 0) + 1;
    fornItens[forn] = (fornItens[forn] || 0) + 1;
    (lojaNfs[loja] || (lojaNfs[loja] = new Set())).add(i.nf_id);
    (tipoNfs[tipo] || (tipoNfs[tipo] = new Set())).add(i.nf_id);
    (fornNfs[forn] || (fornNfs[forn] = new Set())).add(i.nf_id);
  });
  const rank = (itens, nfs, extra) =>
    Object.keys(itens)
      .map((nome) => {
        const qtdNf = (nfs[nome] && nfs[nome].size) || 0;
        const row = { nome, itens: itens[nome], nfs: qtdNf };
        if (extra) extra(row);
        return row;
      })
      .sort((a, b) => b.nfs - a.nfs || b.itens - a.itens || a.nome.localeCompare(b.nome));
  const lojas = rank(lojaItens, lojaNfs, (row) => {
    const ent = volume[row.nome] || 0;
    row.entrada = ent;
    row.taxa = ent ? (row.nfs / ent) * 100 : null;
  });
  const tipos = rank(tipoItens, tipoNfs);
  const fornecedores = rank(fornItens, fornNfs);
  const nfsInc = new Set(inc.map((i) => i.nf_id)).size;
  return { inc, lanc, lojas, tipos, fornecedores, nfsInc, volume };
}

function renderRankBars(id, items, opts) {
  const el = $(id);
  if (!el) return;
  const list = (items || []).slice(0, opts.limit || 10);
  const max = Math.max(1, ...list.map(opts.value));
  el.innerHTML = list.length
    ? list
        .map((it, i) => {
          const w = (opts.value(it) / max) * 100;
          const hot = i === 0 ? " hot1" : i === 1 ? " hot2" : i === 2 ? " hot3" : "";
          const key = opts.filterKey;
          const val = opts.filterVal(it);
          return `<button type="button" class="rank-bar${hot}" data-filter-key="${esc(key)}" data-filter-val="${esc(val)}" title="${esc(opts.label(it))} - clique para filtrar">
            <span class="pos">${i + 1}</span>
            <span class="name">${opts.tag ? opts.tag(it) : ""}${esc(opts.label(it))}</span>
            <span class="track"><i style="width:${w}%"></i></span>
            <span class="qty">${opts.fmt(it)}</span>
          </button>`;
        })
        .join("")
    : `<div class="muted">Sem dados no recorte atual.</div>`;
}

function meter(left, right, leftLabel, rightLabel) {
  const tot = Math.max(1, (left || 0) + (right || 0));
  const lp = ((left || 0) / tot) * 100;
  const rp = 100 - lp;
  return `<div class="meter"><i class="c" style="width:${lp}%"></i><i class="l" style="width:${rp}%"></i></div>
    <div class="meter-leg"><span>Central ${fmt(left)} | ${fmtPct(lp)}</span><span>Lojas ${fmt(right)} | ${fmtPct(rp)}</span></div>
    <div class="muted">${esc(leftLabel)} vs ${esc(rightLabel)}</div>`;
}


function teamStats() {
  const membros = (DATA.equipe || []).map((m) => ({
    codigo: normUser(m.codigo),
    nome: prettyName(m.nome),
    grupo: m.grupo,
    nfs_lancadas: 0,
    lojas_atendidas: new Set(),
    itens_aceitos: 0,
    nfs_aceitas: new Set(),
    exclusoes_nf: 0,
    exclusoes_produto: 0,
  }));
  const byCode = {};
  membros.forEach((m) => {
    byCode[m.codigo] = m;
  });

  const lancAll = filteredLanc({ skipPerson: true });
  let lancCentral = 0;
  let lancLojas = 0;
  lancAll.forEach((row) => {
    const n = normUser(row.usuario);
    if (byCode[n]) {
      byCode[n].nfs_lancadas += 1;
      if (row.loja) byCode[n].lojas_atendidas.add(row.loja);
      lancCentral += 1;
    } else {
      lancLojas += 1;
    }
  });

  const incAll = filteredInc({ skipPerson: true });
  let itensCentral = 0;
  let itensLojas = 0;
  const nfsAceiteC = new Set();
  const nfsAceiteL = new Set();
  incAll.forEach((i) => {
    const n = normUser(i.aceite_usuario || i.usuario);
    if (byCode[n] || i.aceite_eh_central) {
      itensCentral += 1;
      nfsAceiteC.add(i.nf_id);
      if (byCode[n]) {
        byCode[n].itens_aceitos += 1;
        byCode[n].nfs_aceitas.add(i.nf_id);
      }
    } else {
      itensLojas += 1;
      nfsAceiteL.add(i.nf_id);
    }
  });

  const opsAll = filteredOps({ skipPerson: true });
  let enC = 0;
  let enL = 0;
  let epC = 0;
  let epL = 0;
  opsAll.forEach((i) => {
    const n = normUser(i.usuario);
    const central = !!(byCode[n] || i.usuario_eh_central);
    if (i.tipo === "exclusao_nf") {
      if (central) {
        enC += 1;
        if (byCode[n]) byCode[n].exclusoes_nf += 1;
      } else enL += 1;
    } else if (i.tipo === "exclusao_produto") {
      if (central) {
        epC += 1;
        if (byCode[n]) byCode[n].exclusoes_produto += 1;
      } else epL += 1;
    }
  });

  const porDia = {};
  lancAll.forEach((row) => {
    if (!row.data) return;
    if (!porDia[row.data]) porDia[row.data] = { data: row.data, central: 0, lojas: 0 };
    if (byCode[normUser(row.usuario)] || row.usuario_eh_central) porDia[row.data].central += 1;
    else porDia[row.data].lojas += 1;
  });

  membros.sort((a, b) => b.nfs_lancadas - a.nfs_lancadas || b.itens_aceitos - a.itens_aceitos || a.nome.localeCompare(b.nome));
  return {
    membros,
    lancCentral,
    lancLojas,
    itensCentral,
    itensLojas,
    nfsAceiteC: nfsAceiteC.size,
    nfsAceiteL: nfsAceiteL.size,
    enC,
    enL,
    epC,
    epL,
    porDia: Object.keys(porDia)
      .sort()
      .map((k) => porDia[k]),
    lancamentos: lancAll.filter((r) => byCode[normUser(r.usuario)] || r.usuario_eh_central),
    incByNf: incAll.reduce((acc, i) => {
      acc[i.nf_id] = (acc[i.nf_id] || 0) + 1;
      return acc;
    }, {}),
  };
}

function ymdLocal(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdShift(ymd, days) {
  const [y, m, d] = String(ymd || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d + days);
  return ymdLocal(dt);
}

function rotuloDiaOperacional(data, filtrado) {
  const hoje = ymdLocal();
  if (data === hoje) return filtrado ? "Hoje · filtrado" : "Hoje";
  if (data === ymdShift(hoje, -1)) return filtrado ? "Ontem · filtrado" : "Ontem";
  return filtrado ? "Dia filtrado" : "Ultimo dia";
}

function diaOperacionalCentral() {
  const rows = (DATA.lancamentos || []).filter((r) => !isLojaFora(r.loja) && !isForn331(r));
  const datas = [...new Set(rows.map((r) => r.data).filter(Boolean))].sort();
  const filtrada = ($("f-data") && $("f-data").value) || "";
  const data = filtrada || datas[datas.length - 1] || "";
  const doDia = rows.filter((r) => r.data === data);
  const central = doDia.filter((r) => r.usuario_eh_central || isCentralCode(r.usuario));
  const atendidas = new Set(central.map((r) => r.loja).filter(Boolean));
  const nfsPorSeg = {};
  central.forEach((r) => {
    const s = segmentoOf(r);
    if (!s) return;
    nfsPorSeg[s] = (nfsPorSeg[s] || 0) + 1;
  });
  const filtroSeg = ($("f-segmento") && $("f-segmento").value) || "";
  const universoAll = coberturaLista();
  const universo = universoAll.filter((e) => !filtroSeg || e.segmento === filtroSeg);
  const grupos = SEGMENTOS_COBERTURA.map((seg) => {
    const meta = universoAll.filter((e) => e.segmento === seg);
    if (!meta.length) return null;
    const ok = meta.filter((e) => atendidas.has(e.loja));
    const pct = meta.length ? (ok.length / meta.length) * 100 : 0;
    return { seg, label: segmentoLabel(seg), ok: ok.length, meta: meta.length, pct, nfs: nfsPorSeg[seg] || 0 };
  }).filter(Boolean);
  const lojasMeta = universo.length;
  const lojasOk = universo.filter((e) => atendidas.has(e.loja)).length;
  const lojasPct = lojasMeta ? (lojasOk / lojasMeta) * 100 : 0;
  return {
    data,
    filtrado: Boolean(filtrada),
    nfs: central.length,
    lojas: lojasOk,
    lojasMeta,
    lojasPct,
    totalDia: doDia.length,
    grupos,
  };
}

function renderDiaCentral() {
  const el = $("dia-central");
  if (!el) return;
  if (TAB !== "central") {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const d = diaOperacionalCentral();
  if (!d.data) {
    el.innerHTML = `<div class="dia-central-card" style="cursor:default"><div class="dia-central-when"><span class="lbl">Dia operacional</span><strong>${dash}</strong></div></div>`;
    return;
  }
  const titulo = d.filtrado
    ? "Meta: atender lojas e emporios no dia. Clique para limpar o filtro desta data"
    : "Meta: atender lojas e emporios no dia. Clique para filtrar este dia";
  const gruposHtml = d.grupos
    .map((g) => {
      const on = ($("f-segmento") && $("f-segmento").value) === g.seg ? " is-on" : "";
      return `<button type="button" class="dia-grupo${on}" data-filter-key="segmento" data-filter-val="${esc(g.seg)}" title="Filtrar ${esc(g.label)}">
        <span class="lbl">${esc(g.label)}</span>
        <b style="color:${metaColor(g.pct, 100)}">${fmt(g.ok)} <small>de ${fmt(g.meta)}</small></b>
        <div class="track"><i style="width:${g.pct}%;background:${metaColor(g.pct, 100)}"></i></div>
        <div class="sub">${fmt(g.nfs)} NF · ${fmtPct(g.pct)} · meta 100%</div>
      </button>`;
    })
    .join("");
  el.innerHTML = `<div class="dia-central-wrap">
    <button type="button" class="dia-central-card" data-dia="${esc(d.data)}" title="${esc(titulo)}">
      <div class="dia-central-when">
        <span class="lbl">${rotuloDiaOperacional(d.data, d.filtrado)}</span>
        <strong>${fmtData(d.data)}</strong>
      </div>
      <div class="dia-central-stat">
        <span class="lbl">NFs da Central</span>
        <b>${fmt(d.nfs)}</b>
        <div class="sub">de ${fmt(d.totalDia)} no dia</div>
      </div>
      <div class="dia-central-stat">
        <span class="lbl">Unidades atendidas</span>
        <b style="color:${metaColor(d.lojasPct, 100)}">${fmt(d.lojas)} de ${fmt(d.lojasMeta)}</b>
        <div class="sub">${fmtPct(d.lojasPct)} · lojas + emporios</div>
      </div>
    </button>
    <div class="dia-grupos">${gruposHtml}</div>
  </div>`;
}

function renderKpis() {
  const t = DATA.totais;
  const headline = $("headline");
  if (TAB === "central") {
    const s = teamStats();
    const x = execStats();
    const taxa = x.lanc.length ? (x.nfsInc / x.lanc.length) * 100 : 0;
    const topTipo = x.tipos[0];
    const topLoja = x.lojas[0];
    const topForn = x.fornecedores[0];
    const tipoPct = topTipo && x.inc.length ? (topTipo.itens / x.inc.length) * 100 : 0;
    const corTaxa = metaColorDown(taxa, 100);
    const tomTaxa = metaToneDown(taxa, 100);
    const totVol = s.lancCentral + s.lancLojas;
    const pctVol = totVol ? (s.lancCentral / totVol) * 100 : 0;
    const corVol = metaColor(pctVol, 100);
    const tomVol = metaTone(pctVol, 100);
    $("kpis").innerHTML = `
      <article class="card"><div class="lbl">NFs no periodo</div><div class="val">${fmt(x.lanc.length)}</div><div class="sub">lote ${fmt(t.nfs_entrada)}</div></article>
      <article class="card ${tomVol}"><div class="lbl">Central no volume</div><div class="val" style="color:${corVol}">${fmtPct(pctVol)}</div><div class="sub">${fmt(s.lancCentral)} NFs lancadas · meta 100%</div></article>
      <article class="card ${tomTaxa}"><div class="lbl">Taxa de inconsistencia</div><div class="val" style="color:${corTaxa}">${fmtPct(taxa)}</div><div class="sub">lote ${fmtPct(t.taxa_nfs)} · meta 0%</div></article>
      <article class="card"><div class="lbl">Inconsistencia dominante</div><div class="val-text" title="${esc(topTipo ? TIPO_LABEL[topTipo.nome] || topTipo.nome : dash)}">${esc(topTipo ? TIPO_LABEL[topTipo.nome] || topTipo.nome : dash)}</div><div class="sub">${topTipo ? fmtPct(tipoPct) + " dos itens" : ""}</div></article>
      <article class="card"><div class="lbl">Loja critica</div><div class="val-text" title="${esc(topLoja ? topLoja.nome : dash)}">${esc(topLoja ? topLoja.nome : dash)}</div><div class="sub">${topLoja ? fmt(topLoja.nfs) + " NFs | " + fmtPct(topLoja.taxa) : ""}</div></article>
      <article class="card warn"><div class="lbl">NFs inconsistentes</div><div class="val">${fmt(x.nfsInc)}</div><div class="sub">${fmt(x.inc.length)} itens</div></article>
    `;
    if (x.inc.length && topTipo && topLoja) {
      headline.className = "headline";
      headline.innerHTML = `<b>Leitura:</b> ${esc(TIPO_LABEL[topTipo.nome] || topTipo.nome)} concentra ${esc(fmtPct(tipoPct))} dos itens.
        ${esc(topLoja.nome)} lidera com ${esc(fmt(topLoja.nfs))} NF(s)${topLoja.taxa != null ? " (" + fmtPct(topLoja.taxa) + " da entrada da loja)" : ""}.
        ${topForn ? "Fornecedor em destaque: " + esc(shortName(topForn.nome, 42)) + " (" + fmt(topForn.nfs) + " NFs)." : ""}`;
    } else {
      headline.className = "headline ok";
      headline.textContent = "Sem inconsistencias no recorte atual.";
    }
    return;
  }
  headline.textContent = "";
  headline.className = "headline hidden";
  const rows = TAB === "ops" ? filteredOps() : filteredInc();
  if (TAB === "ops") {
    $("kpis").innerHTML = `
      <article class="card"><div class="lbl">Eventos filtrados</div><div class="val">${fmt(rows.length)}</div><div class="sub">${fmt(t.operacionais)} no lote</div></article>
      <article class="card"><div class="lbl">Exclusoes de NF</div><div class="val">${fmt(rows.filter((r) => r.tipo === "exclusao_nf").length)}</div><div class="sub">lote ${fmt(t.exclusoes_nf)}</div></article>
      <article class="card"><div class="lbl">Exclusoes de produto</div><div class="val">${fmt(rows.filter((r) => r.tipo === "exclusao_produto").length)}</div><div class="sub">lote ${fmt(t.exclusoes_produto)}</div></article>
      <article class="card"><div class="lbl">NFs no periodo</div><div class="val">${fmt(t.nfs_entrada)}</div><div class="sub">inclusoes distintas</div></article>
    `;
    return;
  }
  const nfsInc = new Set(rows.map((r) => r.nf_id)).size;
  const users = {};
  rows.forEach((r) => {
    const u = r.aceite_nome || userLabel(r.aceite_usuario || r.usuario);
    if (u) users[u] = (users[u] || 0) + 1;
  });
  const topUser = Object.entries(users).sort((a, b) => b[1] - a[1])[0];
  $("kpis").innerHTML = `
    <article class="card"><div class="lbl">NFs no periodo</div><div class="val">${fmt(t.nfs_entrada)}</div><div class="sub">inclusoes distintas</div></article>
    <article class="card warn"><div class="lbl">NFs inconsistentes</div><div class="val">${fmt(nfsInc)}</div><div class="sub">filtro atual / ${fmt(t.nfs_inconsistentes)} no lote</div></article>
    <article class="card bad"><div class="lbl">Itens inconsistentes</div><div class="val">${fmt(rows.length)}</div><div class="sub">regras disparadas</div></article>
    <article class="card"><div class="lbl">Taxa de NFs</div><div class="val">${fmtPct(t.nfs_entrada ? (nfsInc / t.nfs_entrada) * 100 : 0)}</div><div class="sub">lote ${fmtPct(t.taxa_nfs)}</div></article>
    <article class="card"><div class="lbl">Quem mais aceita</div><div class="val-text" title="${esc(topUser ? topUser[0] : dash)}">${esc(topUser ? topUser[0] : dash)}</div><div class="sub">${topUser ? topUser[1] + " itens" : ""}</div></article>
    <article class="card"><div class="lbl">Operacional</div><div class="val">${fmt(t.operacionais)}</div><div class="sub">${fmt(t.exclusoes_nf)} NF | ${fmt(t.exclusoes_produto)} itens excluidos</div></article>
  `;
}

function renderRank(id, items, fmtItem) {
  $(id).innerHTML =
    (items || [])
      .slice(0, 8)
      .map((it) => `<li><span class="name" title="${esc(it.nome)}">${esc(it.nome)}</span><span>${fmtItem(it)}</span></li>`)
      .join("") || "<li class='muted'>Sem dados</li>";
}

function renderBars() {
  const max = Math.max(1, ...DATA.por_dia.map((d) => d.nfs_entrada));
  $("bars-dia").innerHTML = DATA.por_dia
    .map((d) => {
      const wEnt = (d.nfs_entrada / max) * 100;
      const wInc = (d.nfs_inconsistentes / max) * 100;
      return `<div class="bar-row"><span>${fmtData(d.data)}</span><div class="bar"><i class="alt" style="width:${wEnt}%"></i><i style="width:${wInc}%"></i></div><span>${d.nfs_inconsistentes}/${d.nfs_entrada}</span></div>`;
    })
    .join("");
}

function renderCentral() {
  const s = teamStats();
  const x = execStats();
  renderRankBars("top-lojas", x.lojas, {
    limit: 10,
    value: (it) => it.nfs,
    label: (it) => it.nome,
    tag: (it) => segTag(segmentoOf({ loja: it.nome })),
    fmt: (it) => `${fmt(it.nfs)} NF | ${fmt(it.itens)} itens${it.taxa != null ? " | " + fmtPct(it.taxa) : ""}`,
    filterKey: "loja",
    filterVal: (it) => it.nome,
  });
  renderRankBars("top-tipos", x.tipos, {
    limit: 8,
    value: (it) => it.itens,
    label: (it) => TIPO_LABEL[it.nome] || it.nome,
    fmt: (it) => `${fmt(it.itens)} | ${fmtPct(x.inc.length ? (it.itens / x.inc.length) * 100 : 0)}`,
    filterKey: "tipo",
    filterVal: (it) => it.nome,
  });
  renderRankBars("top-forn", x.fornecedores, {
    limit: 10,
    value: (it) => it.nfs,
    label: (it) => shortName(it.nome, 34),
    fmt: (it) => `${fmt(it.nfs)} NF | ${fmt(it.itens)} itens`,
    filterKey: "forn",
    filterVal: (it) => it.nome,
  });
  $("split-lanc").innerHTML = meter(s.lancCentral, s.lancLojas, "NFs incluidas pela Central", "incluidas nas lojas");
  $("split-aceite").innerHTML = meter(s.itensCentral, s.itensLojas, "itens aceitos pela Central", "aceitos nas lojas");
  $("team").innerHTML = s.membros
    .map((m) => {
      const lead = m === s.membros[0] && m.nfs_lancadas > 0;
      return `<div class="team-row${lead ? " lead" : ""}">
        <div><div class="pname">${esc(m.nome)}</div><span class="muted">${esc(m.codigo)}</span></div>
        <div><b>${fmt(m.nfs_lancadas)}</b><span class="muted">NFs</span></div>
        <div><b>${fmt(m.lojas_atendidas.size)}</b><span class="muted">unidades</span></div>
        <div><b>${fmt(m.itens_aceitos)}</b><span class="muted">itens aceitos</span></div>
        <div><b>${fmt(m.exclusoes_nf + m.exclusoes_produto)}</b><span class="muted">exclusoes</span></div>
      </div>`;
    })
    .join("") || `<div class="muted">Nenhuma pessoa do grupo Central de Recebimento na planilha.</div>`;
}

function renderIncTable(rows) {
  $("count-inc").textContent = `${rows.length} inconsistencia(s) - clique na linha para a linha do tempo da NF`;
  if (!rows.length) {
    $("tb-inc").innerHTML = `<tr class="empty"><td colspan="10" class="muted">Nenhum registro com os filtros atuais.</td></tr>`;
    return;
  }
  $("tb-inc").innerHTML = rows
    .map(
      (i) => `<tr class="clickable" data-nf="${esc(i.nf_id)}">
        <td class="num" data-label="Data">${fmtData(i.data)} ${esc(i.hora || "")}</td>
        <td data-label="Loja">${esc(i.loja)}</td>
        <td data-label="Grupo">${segTag(segmentoOf(i)) || dash}</td>
        <td class="num" data-label="NF">${esc(i.numeronf)}/${esc(i.serienf)}</td>
        <td data-label="Fornecedor">${esc(i.fornecedor)}</td>
        <td data-label="Produto">${esc(i.produto || i.produto_codigo || dash)}</td>
        <td data-label="Tipo">${badge(i.tipo)}</td>
        <td data-label="Aceite">${esc(i.aceite_nome || userLabel(i.aceite_usuario || i.usuario))}</td>
        <td data-label="Equipe">${esc(grupoLabel(i.aceite_usuario, i.aceite_grupo))}</td>
        <td data-label="Justificativa">${esc(i.justificativa || dash)}</td>
      </tr>`
    )
    .join("");
}

function renderOpsTable(rows) {
  $("count-ops").textContent = `${rows.length} evento(s) operacional(is) - exclusao de NF/item`;
  if (!rows.length) {
    $("tb-ops").innerHTML = `<tr class="empty"><td colspan="11" class="muted">Nenhum registro com os filtros atuais.</td></tr>`;
    return;
  }
  $("tb-ops").innerHTML = rows
    .slice(0, 1500)
    .map(
      (i) => `<tr class="clickable" data-nf="${esc(i.seqaux)}|${esc(i.chave)}">
        <td class="num" data-label="Data">${fmtData(i.data)} ${esc(i.hora || "")}</td>
        <td data-label="Loja">${esc(i.loja)}</td>
        <td data-label="Grupo">${segTag(segmentoOf(i)) || dash}</td>
        <td class="num" data-label="NF">${esc(i.numeronf)}/${esc(i.serienf)}</td>
        <td data-label="Fornecedor">${esc(i.fornecedor)}</td>
        <td data-label="Tipo">${badge(i.tipo)}</td>
        <td class="msg" data-label="Produto / campo">${esc(i.produto || i.campo || dash)}${i.produto && i.campo ? "<br>" + esc(i.campo) : ""}</td>
        <td class="num" data-label="De">${esc(i.valor_antigo || dash)}</td>
        <td class="num" data-label="Para">${esc(i.valor_novo || dash)}</td>
        <td data-label="Pessoa">${esc(i.usuario_nome || userLabel(i.usuario))}</td>
        <td data-label="Equipe">${esc(grupoLabel(i.usuario, i.usuario_grupo))}</td>
      </tr>`
    )
    .join("");
}

function openDrawer(nfId) {
  const nf = (DATA.nfs || []).find((n) => n.id === nfId);
  let evs = DATA.timelines[nfId] || [];
  if (!evs.length) {
    evs = (DATA.operacional || [])
      .filter((i) => `${i.seqaux}|${i.chave}` === nfId)
      .map((e) => ({
        iso: e.iso,
        data: e.data,
        hora: e.hora,
        operacao: e.tipo,
        tipo: e.tipo,
        detalhe: e.campo || e.produto,
        valor_antigo: e.valor_antigo,
        valor_novo: e.valor_novo,
        usuario: e.usuario,
        usuario_nome: e.usuario_nome,
        campo: e.campo,
        produto: e.produto,
      }));
  }
  const first = DATA.inconsistencias.find((i) => i.nf_id === nfId) || DATA.operacional.find((i) => `${i.seqaux}|${i.chave}` === nfId) || (DATA.lancamentos || []).find((i) => i.nf_id === nfId);
  $("d-title").textContent = nf
    ? `NF ${nf.numeronf}/${nf.serienf} | ${nf.loja}${nf.segmento || segmentoOf(nf) ? " · " + segmentoLabel(nf.segmento || segmentoOf(nf)) : ""}`
    : first
      ? `NF ${first.numeronf}/${first.serienf} | ${first.loja}${segmentoOf(first) ? " · " + segmentoLabel(segmentoOf(first)) : ""}`
      : "Nota";
  $("d-sub").textContent = (nf || first || {}).chave || nfId;
  $("d-tl").innerHTML = evs.length
    ? evs
        .map(
          (e) => `<li>
            <div class="when">${fmtData(e.data)} ${esc(e.hora)} | ${esc(e.usuario_nome || userLabel(e.usuario))} | ${esc(e.operacao)}</div>
            <div class="what">${esc(e.detalhe || e.campo || e.tipo)}</div>
            ${e.valor_antigo || e.valor_novo ? `<div class="muted">${esc(e.valor_antigo || dash)} -> ${esc(e.valor_novo || dash)}</div>` : ""}
          </li>`
        )
        .join("")
    : "<li class='muted'>Sem linha do tempo para esta nota.</li>";
  $("drawer").classList.add("open");
  document.body.classList.add("drawer-open");
  const scrim = $("drawer-scrim");
  if (scrim) scrim.hidden = false;
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function treatedRow(fonte, r, extra) {
  const u = r.usuario;
  const ace = r.aceite_usuario;
  return Object.assign(
    {
      fonte,
      data: r.data || "",
      hora: r.hora || "",
      loja: r.loja || "",
      nroempresa: r.nroempresa || "",
      segmento: r.segmento || segmentoOf(r),
      numeronf: r.numeronf || "",
      serienf: r.serienf || "",
      fornecedor: r.fornecedor || "",
      produto: r.produto || r.produto_codigo || "",
      tipo: TIPO_LABEL[r.tipo] || r.tipo || "",
      detalhe: r.mensagem || r.campo || "",
      valor_antigo: r.valor_antigo || "",
      valor_novo: r.valor_novo || "",
      usuario: u || "",
      usuario_nome: r.usuario_nome || userLabel(u),
      usuario_grupo: r.usuario_grupo || grupoLabel(u),
      aceite_usuario: ace || "",
      aceite_nome: r.aceite_nome || (ace ? userLabel(ace) : ""),
      aceite_grupo: r.aceite_grupo || (ace ? grupoLabel(ace, r.aceite_grupo) : ""),
      justificativa: r.justificativa || "",
      status: r.status || "",
      chave: r.chave || "",
      seqaux: r.seqaux || "",
      iso: r.iso || "",
    },
    extra || {}
  );
}

function treatedBaseRows() {
  const rows = [];
  (DATA.lancamentos || []).forEach((r) => {
    rows.push(
      treatedRow("lancamento", r, {
        produto: "",
        tipo: TIPO_LABEL.inclusao_nf,
        detalhe: "Inclusao da nota",
        aceite_usuario: "",
        aceite_nome: "",
        aceite_grupo: "",
        justificativa: "",
        status: "",
      })
    );
  });
  (DATA.inconsistencias || []).forEach((r) => rows.push(treatedRow("inconsistencia", r)));
  (DATA.operacional || []).forEach((r) => rows.push(treatedRow("operacional", r)));
  rows.sort((a, b) => String(b.iso).localeCompare(String(a.iso)) || String(a.loja).localeCompare(String(b.loja)) || String(a.numeronf).localeCompare(String(b.numeronf)));
  return rows;
}

function exportCsv() {
  const headers = [
    "fonte",
    "data",
    "hora",
    "loja",
    "nroempresa",
    "segmento",
    "numeronf",
    "serienf",
    "fornecedor",
    "produto",
    "tipo",
    "detalhe",
    "valor_antigo",
    "valor_novo",
    "usuario",
    "usuario_nome",
    "usuario_grupo",
    "aceite_usuario",
    "aceite_nome",
    "aceite_grupo",
    "justificativa",
    "status",
    "chave",
    "seqaux",
  ];
  const rows = treatedBaseRows();
  const p = (DATA && DATA.periodo) || {};
  const name = p.inicio && p.fim ? `base-tratada-recebimentos-${p.inicio}-a-${p.fim}.csv` : "base-tratada-recebimentos.csv";
  const lines = [headers.join(";")].concat(rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const FLUXO_COPY = {
  inicio: "INICIO — a jornada da nota comeca.",
  xml: "Fornecedor envia o XML da NF-e para a Central.",
  pre: "A Central faz a pre-entrada da nota.",
  "dec-c": "A Central pergunta: ha inconsistencia?",
  cadastro: "Tratativa comercial: cadastro de produto.",
  custo: "Tratativa do controller: custo de mercadoria.",
  fiscal: "Tratativa fiscal/contabil: CFOP, CGO e impostos.",
  tratada: "Inconsistencia tratada. A nota volta para validacao.",
  validar: "Validar informacoes e gerar carga para as lojas.",
  conf: "A loja faz a conferencia de carga.",
  "dec-l": "A loja pergunta: ha inconsistencia?",
  devolucao: "Emitir devolucao ou tratar a inconsistencia na loja.",
  finalizar: "A loja finaliza a carga e devolve o processo.",
  fechar: "A Central fecha a carga e gera o financeiro.",
  fim: "FIM — processo encerrado.",
};

const FLUXO_STEPS = {
  ok: ["inicio", "xml", "pre", "dec-c", "validar", "conf", "dec-l", "finalizar", "fechar", "fim"],
  inc: ["inicio", "xml", "pre", "dec-c", "cadastro", "custo", "fiscal", "tratada", "validar", "conf", "dec-l", "devolucao", "finalizar", "fechar", "fim"],
};

const FLUXO_EDGES = {
  ok: ["inicio-xml", "xml-pre", "pre-dec-c", "dec-c-ok", "val-conf", "conf-dec-l", "dec-l-ok", "fin-fech", "fech-fim"],
  inc: ["inicio-xml", "xml-pre", "pre-dec-c", "dec-c-trat", "cad-custo", "custo-fis", "fis-tratada", "tratada-val", "val-conf", "conf-dec-l", "dec-l-dev", "dev-fin", "fin-fech", "fech-fim"],
};

const FLUXO_WIRES = [
  { id: "inicio-xml", from: "inicio", to: "xml", a: "bottom", b: "top", lane: "origem" },
  { id: "xml-pre", from: "xml", to: "pre", a: "right", b: "left", lane: "central" },
  { id: "pre-dec-c", from: "pre", to: "dec-c", a: "bottom", b: "top", lane: "central" },
  { id: "dec-c-trat", from: "dec-c", to: "cadastro", a: "left", b: "right", lane: "trat", tag: "SIM" },
  { id: "dec-c-ok", from: "dec-c", to: "validar", a: "bottom", b: "top", lane: "central", tag: "NAO" },
  { id: "cad-custo", from: "cadastro", to: "custo", a: "bottom", b: "top", lane: "trat" },
  { id: "custo-fis", from: "custo", to: "fiscal", a: "bottom", b: "top", lane: "trat" },
  { id: "fis-tratada", from: "fiscal", to: "tratada", a: "bottom", b: "top", lane: "trat" },
  { id: "tratada-val", from: "tratada", to: "validar", a: "right", b: "left", lane: "central" },
  { id: "val-conf", from: "validar", to: "conf", a: "right", b: "left", lane: "loja" },
  { id: "conf-dec-l", from: "conf", to: "dec-l", a: "bottom", b: "top", lane: "loja" },
  { id: "dec-l-dev", from: "dec-l", to: "devolucao", a: "bottom", b: "top", lane: "loja", tag: "SIM" },
  { id: "dec-l-ok", from: "dec-l", to: "finalizar", a: "right", b: "right", lane: "loja", tag: "NAO", bypass: true },
  { id: "dev-fin", from: "devolucao", to: "finalizar", a: "bottom", b: "top", lane: "loja" },
  { id: "fin-fech", from: "finalizar", to: "fechar", a: "left", b: "right", lane: "central" },
  { id: "fech-fim", from: "fechar", to: "fim", a: "bottom", b: "top", lane: "central" },
];

let fluxoMode = "ok";
let fluxoIdx = 0;
let fluxoTimer = null;
let fluxoRaf = 0;
let fluxoResize = null;

function showFluxoCopy(step) {
  const el = $("fluxo-now");
  if (el) el.textContent = FLUXO_COPY[step] || "";
}

function fluxoAnchor(step, side) {
  const board = $("fluxo-board");
  const svg = $("fluxo-wires");
  const el = board && board.querySelector(`[data-step="${step}"]`);
  if (!board || !svg || !el) return { x: 0, y: 0 };
  const origin = svg.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = r.left - origin.left;
  const y = r.top - origin.top;
  const w = r.width;
  const h = r.height;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (side === "top") return { x: cx, y };
  if (side === "bottom") return { x: cx, y: y + h };
  if (side === "left") return { x, y: cy };
  if (side === "right") return { x: x + w, y: cy };
  return { x: cx, y: cy };
}

function fluxoOffset(p, side, dist) {
  if (side === "top") return { x: p.x, y: p.y - dist };
  if (side === "bottom") return { x: p.x, y: p.y + dist };
  if (side === "left") return { x: p.x - dist, y: p.y };
  if (side === "right") return { x: p.x + dist, y: p.y };
  return { x: p.x, y: p.y };
}

function fluxoPathD(wire, A, B) {
  const gap = Math.min(12, Math.max(6, (Math.abs(B.x - A.x) + Math.abs(B.y - A.y)) / 8));
  const A2 = fluxoOffset(A, wire.a, gap);
  const B2 = fluxoOffset(B, wire.b, gap);
  const round = (n) => Math.round(n * 10) / 10;
  const pt = (p) => `${round(p.x)} ${round(p.y)}`;

  if (wire.bypass) {
    const x = round(Math.max(A2.x, B2.x) + 12);
    return `M ${pt(A)} L ${pt(A2)} L ${x} ${round(A2.y)} L ${x} ${round(B2.y)} L ${pt(B2)} L ${pt(B)}`;
  }

  const vert = (wire.a === "bottom" && wire.b === "top") || (wire.a === "top" && wire.b === "bottom");
  const horz = (wire.a === "right" && wire.b === "left") || (wire.a === "left" && wire.b === "right");
  if (vert && Math.abs(A.x - B.x) < 3) return `M ${pt(A)} L ${pt(B)}`;
  if (horz && Math.abs(A.y - B.y) < 3) return `M ${pt(A)} L ${pt(B)}`;
  if (vert) {
    const my = round((A2.y + B2.y) / 2);
    return `M ${pt(A)} L ${pt(A2)} L ${round(A2.x)} ${my} L ${round(B2.x)} ${my} L ${pt(B2)} L ${pt(B)}`;
  }
  if (horz) {
    const mx = round((A2.x + B2.x) / 2);
    return `M ${pt(A)} L ${pt(A2)} L ${mx} ${round(A2.y)} L ${mx} ${round(B2.y)} L ${pt(B2)} L ${pt(B)}`;
  }
  return `M ${pt(A)} L ${pt(A2)} L ${round(B2.x)} ${round(A2.y)} L ${pt(B2)} L ${pt(B)}`;
}

function layoutFluxoWires() {
  const board = $("fluxo-board");
  const svg = $("fluxo-wires");
  const g = $("fluxo-paths");
  if (!board || !svg || !g) return;
  const w = board.clientWidth;
  const h = board.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  g.innerHTML = "";
  FLUXO_WIRES.forEach((wire) => {
    const A = fluxoAnchor(wire.from, wire.a);
    const B = fluxoAnchor(wire.to, wire.b);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", fluxoPathD(wire, A, B));
    path.setAttribute("data-wire", wire.id);
    path.setAttribute("class", `fluxo-wire w-${wire.lane}`);
    g.appendChild(path);
    if (wire.tag) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      label.setAttribute("x", mx);
      label.setAttribute("y", my - 8);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("data-wire-tag", wire.id);
      label.setAttribute("class", "fluxo-tag");
      label.textContent = wire.tag;
      g.appendChild(label);
    }
  });
  paintFluxoStep();
}

function paintFluxoStep() {
  const steps = FLUXO_STEPS[fluxoMode];
  const current = steps[fluxoIdx] || steps[0];
  const seen = new Set(steps.slice(0, fluxoIdx + 1));
  document.querySelectorAll("#fluxo-board [data-step]").forEach((el) => {
    const id = el.dataset.step;
    el.classList.toggle("is-on", id === current || (id === "tratativas" && ["cadastro", "custo", "fiscal"].includes(current)));
    el.classList.toggle("is-done", seen.has(id) && id !== current);
  });
  const live = new Set(FLUXO_EDGES[fluxoMode].slice(0, Math.max(0, fluxoIdx)));
  document.querySelectorAll("#fluxo-paths [data-wire]").forEach((el) => {
    el.classList.toggle("is-live", live.has(el.getAttribute("data-wire")));
  });
  document.querySelectorAll("#fluxo-paths [data-wire-tag]").forEach((el) => {
    el.classList.toggle("is-live", live.has(el.getAttribute("data-wire-tag")));
  });
  showFluxoCopy(current);
  moveFluxoToken();
}

function moveFluxoToken() {
  const token = $("fluxo-token");
  if (!token) return;
  const edges = FLUXO_EDGES[fluxoMode];
  const wireId = edges[Math.max(0, fluxoIdx - 1)];
  const path = wireId && document.querySelector(`#fluxo-paths [data-wire="${wireId}"]`);
  if (!path || !fluxoIdx) {
    const A = fluxoAnchor(FLUXO_STEPS[fluxoMode][fluxoIdx] || "inicio", "center");
    token.setAttribute("cx", A.x);
    token.setAttribute("cy", A.y);
    token.classList.add("is-on");
    return;
  }
  const len = path.getTotalLength();
  if (fluxoRaf) cancelAnimationFrame(fluxoRaf);
  const start = performance.now();
  const dur = 720;
  token.classList.add("is-on");
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const p = path.getPointAtLength(t * len);
    token.setAttribute("cx", p.x);
    token.setAttribute("cy", p.y);
    if (t < 1) fluxoRaf = requestAnimationFrame(tick);
  };
  fluxoRaf = requestAnimationFrame(tick);
}

function advanceFluxo() {
  const steps = FLUXO_STEPS[fluxoMode];
  fluxoIdx = (fluxoIdx + 1) % steps.length;
  paintFluxoStep();
}

function setFluxoMode(mode) {
  fluxoMode = mode === "inc" ? "inc" : "ok";
  fluxoIdx = 0;
  document.querySelectorAll("[data-fluxo-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.fluxoMode === fluxoMode));
  paintFluxoStep();
}

function setFluxoRunning(on) {
  if (fluxoTimer) {
    clearInterval(fluxoTimer);
    fluxoTimer = null;
  }
  if (fluxoRaf) {
    cancelAnimationFrame(fluxoRaf);
    fluxoRaf = 0;
  }
  if (fluxoResize) {
    window.removeEventListener("resize", fluxoResize);
    fluxoResize = null;
  }
  if (!on) return;
  layoutFluxoWires();
  fluxoIdx = 0;
  paintFluxoStep();
  fluxoResize = () => layoutFluxoWires();
  window.addEventListener("resize", fluxoResize);
  requestAnimationFrame(() => layoutFluxoWires());
  setTimeout(layoutFluxoWires, 60);
  fluxoTimer = setInterval(advanceFluxo, 1600);
}

function setTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("view-central").classList.toggle("hidden", tab !== "central");
  $("view-inc").classList.toggle("hidden", tab !== "inc");
  $("view-ops").classList.toggle("hidden", tab !== "ops");
  $("view-fluxo").classList.toggle("hidden", tab !== "fluxo");
  $("filters").classList.toggle("hidden", tab === "fluxo");
  $("kpis").classList.toggle("hidden", tab === "fluxo");
  const diaEl = $("dia-central");
  if (diaEl) diaEl.classList.toggle("hidden", tab !== "central");
  if (tab === "fluxo") {
    $("headline").className = "headline hidden";
    $("headline").textContent = "";
    setFluxoRunning(true);
    return;
  }
  setFluxoRunning(false);
  if (!DATA) return;
  const tipos = tab === "ops" ? ["exclusao_nf", "exclusao_produto"] : DATA.filtros.tipos;
  fillSelect("f-tipo", tipos || [], "Todos os tipos", TIPO_LABEL);
  $("f-tipo").disabled = false;
  render();
}

function goHome() {
  closeDrawer();
  if (!DATA) return;
  setTab("central");
}

function render() {
  if (!DATA || TAB === "fluxo") return;
  renderDiaCentral();
  renderKpis();
  if (TAB === "central") renderCentral();
  renderIncTable(filteredInc());
  renderOpsTable(filteredOps());
}

function closeDrawer() {
  $("drawer").classList.remove("open");
  document.body.classList.remove("drawer-open");
  const scrim = $("drawer-scrim");
  if (scrim) scrim.hidden = true;
}

function bind() {
  setTodayDate();
  ["q", "f-data", "f-loja", "f-forn", "f-tipo"].forEach((id) => $(id).addEventListener("input", render));
  const fSeg = $("f-segmento");
  if (fSeg) fSeg.addEventListener("input", () => { fillSelectLojas(); render(); });
  $("btn-csv").addEventListener("click", exportCsv);
  const home = $("btn-home");
  if (home) home.addEventListener("click", goHome);
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.querySelectorAll("[data-fluxo-mode]").forEach((b) => {
    b.addEventListener("click", () => setFluxoMode(b.dataset.fluxoMode));
  });
  const fluxoBoard = $("fluxo-board");
  if (fluxoBoard) {
    fluxoBoard.addEventListener("click", (ev) => {
      const node = ev.target.closest("[data-step]");
      if (node && node.dataset.step) showFluxoCopy(node.dataset.step);
    });
  }
  $("d-close").addEventListener("click", closeDrawer);
  const scrim = $("drawer-scrim");
  if (scrim) scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
  document.body.addEventListener("click", (ev) => {
    const btnDia = ev.target.closest("[data-dia]");
    if (btnDia && btnDia.dataset.dia) {
      const sel = $("f-data");
      if (sel) {
        sel.value = sel.value === btnDia.dataset.dia ? "" : btnDia.dataset.dia;
        render();
      }
      return;
    }
    const btn = ev.target.closest("[data-filter-key]");
    if (btn) {
      const map = { loja: "f-loja", forn: "f-forn", tipo: "f-tipo", segmento: "f-segmento" };
      const id = map[btn.dataset.filterKey];
      if (id && $(id)) {
        $(id).value = $(id).value === btn.dataset.filterVal ? "" : btn.dataset.filterVal;
        if (id === "f-segmento") fillSelectLojas();
        render();
      }
      return;
    }
    const tr = ev.target.closest("tr[data-nf]");
    if (tr) openDrawer(tr.dataset.nf);
  });
}

function boot(data) {
  DATA = data;
  (DATA.inconsistencias || []).sort((a, b) => String(b.iso || "").localeCompare(String(a.iso || "")));
  (DATA.operacional || []).sort((a, b) => String(b.iso || "").localeCompare(String(a.iso || "")));
  (DATA.nfs || []).sort((a, b) => String(b.iso || "").localeCompare(String(a.iso || "")));
  const p = data.periodo || {};
  $("meta").textContent = metaLabel(data);
  const periodoEl = $("periodo");
  const periodoTxt = fmtPeriodo(p.inicio, p.fim);
  if (periodoEl) {
    periodoEl.hidden = !periodoTxt;
    periodoEl.textContent = periodoTxt;
  }
  const datas = data.filtros.datas || [];
  const dataLabels = Object.fromEntries(datas.map((d) => [d, fmtData(d)]));
  fillSelect("f-data", datas, "Todas as datas", dataLabels);
  const segs = (data.filtros && data.filtros.segmentos && data.filtros.segmentos.length)
    ? data.filtros.segmentos
    : SEGMENTOS_COBERTURA.filter((s) => coberturaLista().some((e) => e.segmento === s));
  fillSelect("f-segmento", segs, "Todos os grupos", SEGMENTO_LABEL);
  fillSelectLojas();
  fillSelect("f-forn", (data.filtros.fornecedores || []).filter((f) => !isForn331(f)), "Todos os fornecedores");
  fillSelect("f-tipo", data.filtros.tipos, "Todos os tipos", TIPO_LABEL);
  renderRank("rk-loja", (data.rankings.lojas || []).filter((it) => !isLojaFora(it.nome)), (it) => `${it.nfs_inconsistentes} NF${it.taxa != null ? " | " + it.taxa + "%" : ""}`);
  renderRank("rk-forn", (data.rankings.fornecedores || []).filter((it) => !isForn331(it.nome)), (it) => fmt(it.qtd));
  renderRank("rk-prod", data.rankings.produtos, (it) => fmt(it.qtd));
  renderRank("rk-just", (data.rankings.justificativas || []).filter((it) => String(it.nome || "").trim().toLowerCase() !== "ok"), (it) => fmt(it.qtd));
  renderBars();
  render();
}

async function load() {
  if (window.AUDITORIA) {
    boot(window.AUDITORIA);
    return;
  }
  try {
    const res = await fetch("dados.json");
    if (!res.ok) throw new Error(res.statusText);
    boot(await res.json());
  } catch (err) {
    $("meta").textContent = "Nao foi possivel carregar dados.js/dados.json. Rode: powershell -ExecutionPolicy Bypass -File parse_auditoria.ps1";
    console.error(err);
  }
}

bind();
load();
