(function () {
  const SHEET_ID = "13R78aXOg1EveB5bdp1Mf9kzS7Kz0Wy-F6XvKM7ao9wM";
  const SHEET_GID = "0";
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;
  const GVIZ_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const LOAD_TIMEOUT_MS = 15000;
  const SEM_SETOR = "Sem setor definido";
  const SEM_CONTATO = "Sem contato definido";

  const AGE_BUCKETS = [
    { id: "0", label: "Hoje (0 dia)", test: (d) => d <= 0, color: "var(--good)" },
    { id: "1", label: "1 dia", test: (d) => d === 1, color: "#9bd36a" },
    { id: "2-3", label: "2 a 3 dias", test: (d) => d >= 2 && d <= 3, color: "var(--warn)" },
    { id: "4-7", label: "4 a 7 dias", test: (d) => d >= 4 && d <= 7, color: "#f0803c" },
    { id: "8+", label: "Mais de 7 dias", test: (d) => d >= 8, color: "var(--bad)" },
  ];

  const FILTER_LABEL = {
    tipo: "Tipo",
    loja: "Loja",
    resp: "Responsavel",
    idade: "Idade",
    data: "Data",
    atendente: "Atendente",
  };

  const state = {
    rows: [],
    loaded: false,
    loading: false,
    error: "",
    updatedAt: null,
    filters: {},
    bound: false,
  };

  const el = (id) => document.getElementById(id);
  const escH = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");
  const pct = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  function fold(s) {
    return String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\uFFFD/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function titleCase(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
  }

  function tipoOf(msg) {
    const f = fold(msg);
    if (!f) return "Nao informado";
    if (f.includes("DATA DE SAIDA")) return "Data de saida maior que a entrada";
    if (f.includes("CUSTO MEDIO")) return "Valor acima do custo medio + limite";
    if (/PRE.?O DE CUSTO/.test(f)) return "Valor acima do preco de custo + limite";
    if (/PRE.?O DE VENDA/.test(f)) return "Valor acima do preco de venda";
    return titleCase(f);
  }

  function lojaCode(raw) {
    return String(raw || "").replace(/\s+/g, "").toUpperCase();
  }

  function dateParts(raw) {
    const m = String(raw || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return { br: String(raw || "").trim(), ymd: "" };
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return { br: `${d}/${mo}/${m[3]}`, ymd: `${m[3]}-${mo}-${d}` };
  }

  function daysSince(ymd) {
    if (!ymd) return 0;
    const [y, m, d] = ymd.split("-").map(Number);
    const then = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - then) / 86400000));
  }

  function normalizeRecord(rec) {
    const status = fold(rec.STATUS);
    if (status !== "PENDENTE") return null;
    const dt = dateParts(rec.DATA);
    const diasRaw = String(rec.DIAS ?? "").trim();
    const dias = diasRaw !== "" && Number.isFinite(Number(diasRaw)) ? Number(diasRaw) : daysSince(dt.ymd);
    const setor = titleCase(fold(rec.SETOR)) || SEM_SETOR;
    const contato = titleCase(fold(rec.CONTATO)) || SEM_CONTATO;
    const resp =
      setor === SEM_SETOR && contato === SEM_CONTATO
        ? "Sem responsavel definido"
        : `${contato === SEM_CONTATO ? "Sem contato" : contato} · ${setor === SEM_SETOR ? "Sem setor" : setor}`;
    const inconsistencia = String(rec.INCONSISTENCIA || "").replace(/\s+/g, " ").trim();
    const bucket = AGE_BUCKETS.find((b) => b.test(dias)) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
    return {
      codLoja: lojaCode(rec["COD. LOJA"]),
      loja: titleCase(fold(rec.LOJA)) || "Sem loja",
      nota: String(rec.NOTA ?? "").replace(/\.0+$/, "").trim(),
      data: dt.br,
      ymd: dt.ymd,
      inconsistencia,
      tipo: tipoOf(inconsistencia),
      contato,
      setor,
      resp,
      atendente: titleCase(fold(rec["ATENDIMENTO CENTRAL"])) || "Sem atendente",
      dias,
      idade: bucket.id,
    };
  }

  function recordsFromTable(headers, rows) {
    const keys = headers.map((h) => fold(h));
    return rows.map((cells) => {
      const rec = {};
      keys.forEach((k, i) => {
        if (k) rec[k] = cells[i];
      });
      return rec;
    });
  }

  function loadJsonp() {
    return new Promise((resolve, reject) => {
      const cb = `__pendenciasCb_${Date.now()}`;
      const script = document.createElement("script");
      let done = false;
      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        try {
          delete window[cb];
        } catch (_) {
          window[cb] = undefined;
        }
        script.remove();
      };
      const timer = setTimeout(() => {
        if (done) return;
        cleanup();
        reject(new Error("Tempo esgotado ao ler a planilha"));
      }, LOAD_TIMEOUT_MS);
      window[cb] = (resp) => {
        if (done) return;
        cleanup();
        if (!resp || resp.status !== "ok" || !resp.table) {
          reject(new Error((resp && resp.errors && resp.errors[0] && resp.errors[0].detailed_message) || "Resposta invalida da planilha"));
          return;
        }
        const headers = resp.table.cols.map((c) => c.label || "");
        const rows = (resp.table.rows || []).map((r) => (r.c || []).map((c) => (c ? (c.f != null ? c.f : c.v) : "")));
        resolve(recordsFromTable(headers, rows));
      };
      script.onerror = () => {
        if (done) return;
        cleanup();
        reject(new Error("Falha ao carregar a planilha"));
      };
      script.src = `${GVIZ_BASE}?tqx=out:json;responseHandler:${cb}&headers=1&gid=${SHEET_GID}&t=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function parseCsv(text) {
    const out = [];
    let row = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        out.push(row);
        row = [];
        cur = "";
      } else cur += ch;
    }
    if (cur || row.length) {
      row.push(cur);
      out.push(row);
    }
    return out;
  }

  async function loadCsv() {
    const res = await fetch(`${GVIZ_BASE}?tqx=out:csv&headers=1&gid=${SHEET_GID}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const table = parseCsv(await res.text());
    if (!table.length) return [];
    return recordsFromTable(table[0], table.slice(1));
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    state.error = "";
    renderStatus();
    try {
      let records;
      try {
        records = await loadJsonp();
      } catch (jsonpErr) {
        console.warn("Pendencias: JSONP falhou, tentando CSV", jsonpErr);
        records = await loadCsv();
      }
      state.rows = records.map(normalizeRecord).filter(Boolean);
      state.loaded = true;
      state.updatedAt = new Date();
    } catch (err) {
      console.error(err);
      state.error = err && err.message ? err.message : String(err);
    } finally {
      state.loading = false;
      render();
    }
  }

  function filtered() {
    return state.rows.filter((r) => Object.entries(state.filters).every(([k, v]) => !v || r[k] === v));
  }

  function groupCount(rows, key) {
    const map = new Map();
    rows.forEach((r) => map.set(r[key], (map.get(r[key]) || 0) + 1));
    return [...map.entries()].map(([nome, qtd]) => ({ nome, qtd }));
  }

  function renderBars(id, items, opts) {
    const box = el(id);
    if (!box) return;
    const list = items.slice(0, opts.limit || 10);
    const max = Math.max(1, ...list.map((it) => it.qtd));
    const total = opts.total || 0;
    const active = state.filters[opts.key];
    box.innerHTML = list.length
      ? list
          .map((it, i) => {
            const w = (it.qtd / max) * 100;
            const hot = opts.noHot ? "" : i === 0 ? " hot1" : i === 1 ? " hot2" : i === 2 ? " hot3" : "";
            const on = active === it.nome ? " is-active" : "";
            const color = opts.color ? opts.color(it) : "";
            const label = opts.label ? opts.label(it) : it.nome;
            const share = total ? ` | ${pct((it.qtd / total) * 100)}` : "";
            return `<button type="button" class="rank-bar${hot}${on}" data-pd-key="${escH(opts.key)}" data-pd-val="${escH(it.nome)}" title="${escH(label)} - clique para filtrar">
              <span class="pos">${opts.pos === false ? "" : i + 1}</span>
              <span class="name">${escH(label)}</span>
              <span class="track"><i style="width:${w}%${color ? `;background:${color}` : ""}"></i></span>
              <span class="qty">${num(it.qtd)}${share}</span>
            </button>`;
          })
          .join("")
      : `<div class="muted">Sem pendencias no recorte atual.</div>`;
  }

  function renderKpis(rows) {
    const box = el("pd-kpis");
    if (!box) return;
    const nfs = new Set(rows.map((r) => `${r.codLoja}|${r.nota}`)).size;
    const lojas = new Set(rows.map((r) => r.codLoja || r.loja)).size;
    const dias = rows.map((r) => r.dias);
    const media = dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : 0;
    const max = dias.length ? Math.max(...dias) : 0;
    const semResp = rows.filter((r) => r.setor === SEM_SETOR || r.contato === SEM_CONTATO).length;
    const semRespPct = rows.length ? (semResp / rows.length) * 100 : 0;
    const tomIdade = max >= 8 ? "bad" : max >= 2 ? "warn" : "good";
    const tomResp = semRespPct >= 50 ? "bad" : semResp ? "warn" : "good";
    box.innerHTML = `
      <article class="card ${rows.length ? "bad" : "good"}"><div class="lbl">Pendencias</div><div class="val">${num(rows.length)}</div><div class="sub">status PENDENTE na planilha</div></article>
      <article class="card"><div class="lbl">NFs distintas</div><div class="val">${num(nfs)}</div><div class="sub">notas com alguma pendencia</div></article>
      <article class="card"><div class="lbl">Lojas afetadas</div><div class="val">${num(lojas)}</div><div class="sub">unidades com pendencia</div></article>
      <article class="card ${tomIdade}"><div class="lbl">Idade media</div><div class="val">${media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d</div><div class="sub">mais antiga: ${num(max)} dia(s)</div></article>
      <article class="card ${tomResp}"><div class="lbl">Sem responsavel</div><div class="val">${num(semResp)}</div><div class="sub">${pct(semRespPct)} sem setor ou contato</div></article>`;
  }

  function renderHeadline(rows, tipos, lojas) {
    const box = el("pd-headline");
    if (!box) return;
    if (!rows.length) {
      box.className = "headline ok";
      box.textContent = state.rows.length ? "Nenhuma pendencia no filtro atual." : "Nenhuma pendencia em aberto na planilha.";
      return;
    }
    const nfs = new Set(rows.map((r) => `${r.codLoja}|${r.nota}`)).size;
    const semSetor = rows.filter((r) => r.setor === SEM_SETOR).length;
    const old = rows.filter((r) => r.dias >= 2).length;
    const parts = [`<b>${num(rows.length)}</b> pendencia(s) em <b>${num(nfs)}</b> NF(s)`];
    if (tipos[0]) parts.push(`tipo mais comum: <b>${escH(tipos[0].nome)}</b> (${pct((tipos[0].qtd / rows.length) * 100)})`);
    if (lojas[0]) parts.push(`loja com mais pendencias: <b>${escH(lojas[0].nome)}</b> (${num(lojas[0].qtd)})`);
    if (semSetor) parts.push(`<b>${pct((semSetor / rows.length) * 100)}</b> sem setor definido`);
    if (old) parts.push(`<b>${num(old)}</b> com 2 dias ou mais`);
    box.className = "headline";
    box.innerHTML = parts.join(" · ");
  }

  function renderTable(rows) {
    const count = el("pd-count");
    const tb = el("pd-tbody");
    if (!tb) return;
    if (count) count.textContent = `${num(rows.length)} pendencia(s) - ordenadas pela mais antiga`;
    if (!rows.length) {
      tb.innerHTML = `<tr class="empty"><td colspan="8" class="muted">Nenhuma pendencia com os filtros atuais.</td></tr>`;
      return;
    }
    const sorted = rows.slice().sort((a, b) => b.dias - a.dias || a.ymd.localeCompare(b.ymd) || a.loja.localeCompare(b.loja));
    tb.innerHTML = sorted
      .map((r) => {
        const bucket = AGE_BUCKETS.find((b) => b.id === r.idade);
        return `<tr>
          <td data-label="Loja">${r.codLoja ? `<span class="muted">${escH(r.codLoja)}</span> ` : ""}${escH(r.loja)}</td>
          <td class="num" data-label="Nota">${escH(r.nota || "-")}</td>
          <td class="num" data-label="Data">${escH(r.data || "-")}</td>
          <td class="msg" data-label="Inconsistencia"><span class="pd-tipo">${escH(r.tipo)}</span><br><span class="muted">${escH(r.inconsistencia)}</span></td>
          <td data-label="Contato">${r.contato === SEM_CONTATO ? '<span class="muted">-</span>' : escH(r.contato)}</td>
          <td data-label="Setor">${r.setor === SEM_SETOR ? '<span class="pd-missing">Sem setor</span>' : escH(r.setor)}</td>
          <td data-label="Atendente">${escH(r.atendente)}</td>
          <td class="num" data-label="Dias"><span class="pd-age" style="background:${bucket ? bucket.color : "var(--muted)"}">${num(r.dias)}</span></td>
        </tr>`;
      })
      .join("");
  }

  function renderChips() {
    const box = el("pd-chips");
    if (!box) return;
    const entries = Object.entries(state.filters).filter(([, v]) => v);
    box.innerHTML = entries
      .map(([k, v]) => {
        const label = k === "idade" ? (AGE_BUCKETS.find((b) => b.id === v) || {}).label || v : v;
        return `<button type="button" class="pd-chip" data-pd-key="${escH(k)}" data-pd-val="${escH(v)}" title="Remover filtro">${escH(FILTER_LABEL[k] || k)}: ${escH(label)} ×</button>`;
      })
      .join("");
  }

  function renderStatus() {
    const box = el("pd-status");
    if (box) {
      if (state.loading) box.textContent = "Carregando planilha...";
      else if (state.error) box.textContent = "Erro ao ler a planilha";
      else if (state.updatedAt) {
        const t = state.updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        box.textContent = `Atualizado as ${t}`;
      } else box.textContent = "";
    }
    const btn = el("pd-reload");
    if (btn) btn.disabled = state.loading;
    const banner = el("pd-error");
    if (banner) {
      banner.hidden = !state.error;
      const msg = el("pd-error-msg");
      if (msg) msg.textContent = state.error;
    }
  }

  function render() {
    renderStatus();
    renderChips();
    const content = el("pd-content");
    if (content) content.classList.toggle("is-loading", state.loading && !state.loaded);
    if (!state.loaded) return;
    const rows = filtered();
    const total = rows.length;
    const tipos = groupCount(rows, "tipo").sort((a, b) => b.qtd - a.qtd);
    const lojas = groupCount(rows, "loja").sort((a, b) => b.qtd - a.qtd);
    renderKpis(rows);
    renderHeadline(rows, tipos, lojas);
    renderBars("pd-tipos", tipos, { key: "tipo", total });
    renderBars("pd-lojas", lojas, { key: "loja", total });
    renderBars("pd-resp", groupCount(rows, "resp").sort((a, b) => b.qtd - a.qtd), { key: "resp", total });
    const idadeCounts = groupCount(rows, "idade");
    renderBars(
      "pd-idade",
      AGE_BUCKETS.map((b) => ({ nome: b.id, qtd: (idadeCounts.find((c) => c.nome === b.id) || {}).qtd || 0 })),
      {
        key: "idade",
        total,
        noHot: true,
        pos: false,
        label: (it) => (AGE_BUCKETS.find((b) => b.id === it.nome) || {}).label || it.nome,
        color: (it) => (AGE_BUCKETS.find((b) => b.id === it.nome) || {}).color,
      }
    );
    const ymdByData = new Map(rows.map((r) => [r.data, r.ymd]));
    renderBars(
      "pd-datas",
      groupCount(rows, "data").sort((a, b) => String(ymdByData.get(a.nome)).localeCompare(String(ymdByData.get(b.nome)))),
      { key: "data", total, noHot: true, pos: false, limit: 31 }
    );
    renderBars("pd-atendente", groupCount(rows, "atendente").sort((a, b) => b.qtd - a.qtd), { key: "atendente", total });
    renderTable(rows);
  }

  function toggleFilter(key, val) {
    if (!key) return;
    state.filters[key] = state.filters[key] === val ? "" : val;
    render();
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;
    const view = el("view-inc");
    if (view) {
      view.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-pd-key]");
        if (btn) toggleFilter(btn.dataset.pdKey, btn.dataset.pdVal);
      });
    }
    const clear = el("pd-clear");
    if (clear) {
      clear.addEventListener("click", () => {
        state.filters = {};
        render();
      });
    }
    const reload = el("pd-reload");
    if (reload) reload.addEventListener("click", load);
    document.querySelectorAll("[data-pd-sheet]").forEach((a) => a.setAttribute("href", SHEET_URL));
  }

  window.initPendenciasDash = function () {
    bind();
    if (!state.loaded && !state.loading) load();
    else render();
  };
})();
