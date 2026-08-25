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
            <span class="name">${esc(opts.label(it))}</span>
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
      <article class="card warn"><div class="lbl">NFs inconsistentes</div><div class="val">${fmt(x.nfsInc)}</div><div class="sub">${fmt(x.inc.length)} itens</div></article>
      <article class="card ${tomTaxa}"><div class="lbl">Taxa de inconsistencia</div><div class="val" style="color:${corTaxa}">${fmtPct(taxa)}</div><div class="sub">lote ${fmtPct(t.taxa_nfs)} · meta 0%</div></article>
      <article class="card"><div class="lbl">Inconsistencia dominante</div><div class="val-text" title="${esc(topTipo ? TIPO_LABEL[topTipo.nome] || topTipo.nome : dash)}">${esc(topTipo ? TIPO_LABEL[topTipo.nome] || topTipo.nome : dash)}</div><div class="sub">${topTipo ? fmtPct(tipoPct) + " dos itens" : ""}</div></article>
      <article class="card"><div class="lbl">Loja critica</div><div class="val-text" title="${esc(topLoja ? topLoja.nome : dash)}">${esc(topLoja ? topLoja.nome : dash)}</div><div class="sub">${topLoja ? fmt(topLoja.nfs) + " NFs | " + fmtPct(topLoja.taxa) : ""}</div></article>
      <article class="card ${tomVol}"><div class="lbl">Central no volume</div><div class="val" style="color:${corVol}">${fmtPct(pctVol)}</div><div class="sub">${fmt(s.lancCentral)} NFs lancadas · meta 100%</div></article>
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
        <div><b>${fmt(m.itens_aceitos)}</b><span class="muted">itens aceitos</span></div>
        <div><b>${fmt(m.exclusoes_nf + m.exclusoes_produto)}</b><span class="muted">exclusoes</span></div>
      </div>`;
    })
    .join("") || `<div class="muted">Nenhuma pessoa do grupo Central de Recebimento na planilha.</div>`;
}

function renderIncTable(rows) {
  $("count-inc").textContent = `${rows.length} inconsistencia(s) - clique na linha para a linha do tempo da NF`;
  if (!rows.length) {
    $("tb-inc").innerHTML = `<tr class="empty"><td colspan="9" class="muted">Nenhum registro com os filtros atuais.</td></tr>`;
    return;
  }
  $("tb-inc").innerHTML = rows
    .map(
      (i) => `<tr class="clickable" data-nf="${esc(i.nf_id)}">
        <td class="num" data-label="Data">${fmtData(i.data)} ${esc(i.hora || "")}</td>
        <td data-label="Loja">${esc(i.loja)}</td>
        <td class="num" data-label="NF">${esc(i.numeronf)}/${esc(i.serienf)}</td>
        <td data-label="Fornecedor">${esc(i.fornecedor)}</td>
        <td data-label="Produto">${esc(i.produto || i.produto_codigo || dash)}</td>
        <td data-label="Tipo">${badge(i.tipo)}</td>
        <td data-label="Aceite">${esc(i.aceite_nome || userLabel(i.aceite_usuario || i.usuario))}</td>
        <td data-label="Grupo">${esc(grupoLabel(i.aceite_usuario, i.aceite_grupo))}</td>
        <td data-label="Justificativa">${esc(i.justificativa || dash)}</td>
      </tr>`
    )
    .join("");
}

function renderOpsTable(rows) {
  $("count-ops").textContent = `${rows.length} evento(s) operacional(is) - exclusao de NF/item`;
  if (!rows.length) {
    $("tb-ops").innerHTML = `<tr class="empty"><td colspan="10" class="muted">Nenhum registro com os filtros atuais.</td></tr>`;
    return;
  }
  $("tb-ops").innerHTML = rows
    .slice(0, 1500)
    .map(
      (i) => `<tr class="clickable" data-nf="${esc(i.seqaux)}|${esc(i.chave)}">
        <td class="num" data-label="Data">${fmtData(i.data)} ${esc(i.hora || "")}</td>
        <td data-label="Loja">${esc(i.loja)}</td>
        <td class="num" data-label="NF">${esc(i.numeronf)}/${esc(i.serienf)}</td>
        <td data-label="Fornecedor">${esc(i.fornecedor)}</td>
        <td data-label="Tipo">${badge(i.tipo)}</td>
        <td class="msg" data-label="Produto / campo">${esc(i.produto || i.campo || dash)}${i.produto && i.campo ? "<br>" + esc(i.campo) : ""}</td>
        <td class="num" data-label="De">${esc(i.valor_antigo || dash)}</td>
        <td class="num" data-label="Para">${esc(i.valor_novo || dash)}</td>
        <td data-label="Pessoa">${esc(i.usuario_nome || userLabel(i.usuario))}</td>
        <td data-label="Grupo">${esc(grupoLabel(i.usuario, i.usuario_grupo))}</td>
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
    ? `NF ${nf.numeronf}/${nf.serienf} | ${nf.loja}`
    : first
      ? `NF ${first.numeronf}/${first.serienf} | ${first.loja}`
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

function setTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("view-central").classList.toggle("hidden", tab !== "central");
  $("view-inc").classList.toggle("hidden", tab !== "inc");
  $("view-ops").classList.toggle("hidden", tab !== "ops");
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
  if (!DATA) return;
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
  $("btn-csv").addEventListener("click", exportCsv);
  const home = $("btn-home");
  if (home) home.addEventListener("click", goHome);
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("d-close").addEventListener("click", closeDrawer);
  const scrim = $("drawer-scrim");
  if (scrim) scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
  document.body.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-filter-key]");
    if (btn) {
      const map = { loja: "f-loja", forn: "f-forn", tipo: "f-tipo" };
      const id = map[btn.dataset.filterKey];
      if (id && $(id)) {
        $(id).value = $(id).value === btn.dataset.filterVal ? "" : btn.dataset.filterVal;
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
  const planilha = data.usuarios_arquivo ? ` | ${data.usuarios_arquivo}` : "";
  $("meta").textContent = `${data.arquivo || ""}${planilha} | ${fmtData(p.inicio)} a ${fmtData(p.fim)} | gerado ${data.gerado_em || ""}`;
  const periodoEl = $("periodo");
  const periodoTxt = fmtPeriodo(p.inicio, p.fim);
  if (periodoEl) {
    periodoEl.hidden = !periodoTxt;
    periodoEl.textContent = periodoTxt;
  }
  const datas = data.filtros.datas || [];
  const dataLabels = Object.fromEntries(datas.map((d) => [d, fmtData(d)]));
  fillSelect("f-data", datas, "Todas as datas", dataLabels);
  fillSelect("f-loja", data.filtros.lojas.filter((l) => !isLojaFora(l)), "Todas as lojas");
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
