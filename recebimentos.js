window.initRecebimentosDash = function initRecebimentosDash() {
  "use strict";
  if (window.__recebimentosReady) return;
  window.__recebimentosReady = true;


  var DATA_PATH = "Bases/Painel de controle de recebimento.txt";
  var PAGE_SIZE = 50;
  var SIT_ORDER = ["RECEBIDA", "XML", "RECEBIMENTO", "CONFERENCIA", "NOTA LIBERADA"];
  var EXCLUDED_EMPRESA_CODES = { C001: true, C038: true, R066: true, C034: true };
  var EXCLUDED_FORNECEDOR_CODES = { "331": true };
  var RIO_GRANDE_NAME = "RIO GRANDE COMERCIO DE CARNE";
  var RIO_GRANDE_KEEP_CODE = "10";
  var SEGMENTO_LABEL = {
    LOJAS: "Lojas",
    EMPORIOS: "Emporios",
    MERCEARIA: "Mercearias",
    CD: "CD",
    BARRA: "Barra",
    AGRO: "Agro",
  };
  var SEGMENTO_ORDER = ["LOJAS", "EMPORIOS", "MERCEARIA", "CD", "BARRA", "AGRO"];

  var empresasNroMap = {};
  var empresasLojaMap = {};

  var allRows = [];
  var filtered = [];
  var page = 0;
  var detailSort = { key: "dataEntrada", dir: "desc" };
  var rawCount = 0;
  var excludedCount = 0;

  var els = {
    loadStatus: document.getElementById("rb-loadStatus"),
    loadBanner: document.getElementById("rb-loadBanner"),
    headerSub: document.getElementById("rb-headerSub"),
    footerMeta: null,
    fileInput: document.getElementById("rb-fileInput"),
    fDataDe: document.getElementById("rb-fDataDe"),
    fDataAte: document.getElementById("rb-fDataAte"),
    fSituacao: document.getElementById("rb-fSituacao"),
    fGrupo: document.getElementById("rb-fGrupo"),
    fEmpresa: document.getElementById("rb-fEmpresa"),
    kpiGrid: document.getElementById("rb-kpiGrid"),
    kpiCaption: document.getElementById("rb-kpiCaption"),
    funilBars: document.getElementById("rb-funilBars"),
    ritmoTableWrap: document.getElementById("rb-ritmoTableWrap"),
    lojasTableWrap: document.getElementById("rb-lojasTableWrap"),
    fornecedoresTableWrap: document.getElementById("rb-fornecedoresTableWrap"),
    maioresTableWrap: document.getElementById("rb-maioresTableWrap"),
    cgoTableWrap: document.getElementById("rb-cgoTableWrap"),
    qualidadeChips: document.getElementById("rb-qualidadeChips"),
    detailTableWrap: document.getElementById("rb-detailTableWrap"),
    tableCaption: document.getElementById("rb-tableCaption"),
    pagerInfo: document.getElementById("rb-pagerInfo"),
    btnPrevPage: document.getElementById("rb-btnPrevPage"),
    btnNextPage: document.getElementById("rb-btnNextPage"),
    btnExportExcel: document.getElementById("rb-btnExportExcel"),
  };

  function empresaNroNorm(code) {
    var s = String(code || "").trim().toUpperCase();
    if (!s) return "";
    if (/^R/i.test(s)) s = s.slice(1);
    s = s.replace(/^0+/, "");
    return s || String(code || "").trim();
  }

  function loadEmpresasBase() {
    var data = window.AUDITORIA || window.DATA || null;
    empresasNroMap = (data && data.empresas) || {};
    empresasLojaMap = (data && data.empresas_loja) || {};
  }

  function segmentoLabel(seg) {
    return SEGMENTO_LABEL[seg] || seg || "—";
  }

  function segmentoEmpresa(empresa) {
    if (!empresa) return "";
    var loja = String(empresa).trim();
    var byLoja = empresasLojaMap[loja];
    if (byLoja && byLoja.segmento) return byLoja.segmento;
    var code = empresaCode(loja);
    var nro = empresaNroNorm(code);
    var byNro = empresasNroMap[nro] || empresasNroMap[code] || empresasNroMap[loja];
    return (byNro && byNro.segmento) || "";
  }

  function segmentosDisponiveis() {
    var set = Object.create(null);
    var data = window.AUDITORIA || window.DATA || null;
    var fromBase = (data && data.filtros && data.filtros.segmentos) || [];
    for (var i = 0; i < fromBase.length; i++) {
      if (fromBase[i]) set[fromBase[i]] = true;
    }
    for (var j = 0; j < allRows.length; j++) {
      var seg = segmentoEmpresa(allRows[j].empresa);
      if (seg) set[seg] = true;
    }
    return Object.keys(set).sort(function (a, b) {
      var ia = SEGMENTO_ORDER.indexOf(a);
      var ib = SEGMENTO_ORDER.indexOf(b);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "pt-BR");
    });
  }

  function empresasForGrupo(grupo) {
    var emps = uniqueSorted(allRows.map(function (r) { return r.empresa; }));
    if (!grupo) return emps;
    return emps.filter(function (emp) {
      return segmentoEmpresa(emp) === grupo;
    });
  }

  loadEmpresasBase();

  function setStatus(text, kind) {
    if (!els.loadStatus) return;
    els.loadStatus.textContent = text;
    els.loadStatus.className = "status-pill" + (kind ? " " + kind : "");
  }

  function parseDate(raw) {
    if (!raw) return "";
    var m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  /** Converte dd/mm/yyyy → YYYY-MM-DD (ou "" se incompleto/inválido). */
  function brDateToIso(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    var dd = Number(m[1]);
    var mm = Number(m[2]);
    var yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
    var iso =
      String(yyyy) +
      "-" +
      String(mm).padStart(2, "0") +
      "-" +
      String(dd).padStart(2, "0");
    var dt = new Date(iso + "T00:00:00");
    if (isNaN(dt) || dt.getFullYear() !== yyyy || dt.getMonth() + 1 !== mm || dt.getDate() !== dd) {
      return "";
    }
    return iso;
  }

  var CAL_MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  var CAL_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var calPopover = null;
  var calAnchor = null;
  var calView = { y: 0, m: 0 };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoFromYmd(y, m, d) {
    return String(y) + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseIsoParts(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  function dateOutOfBounds(iso, minD, maxD) {
    if (!iso) return true;
    if (minD && iso < minD) return true;
    if (maxD && iso > maxD) return true;
    return false;
  }

  function shiftMonth(y, m, delta) {
    var nm = m + delta;
    var ny = y;
    while (nm < 1) {
      nm += 12;
      ny -= 1;
    }
    while (nm > 12) {
      nm -= 12;
      ny += 1;
    }
    return { y: ny, m: nm };
  }

  function monthIntersectsRange(y, m, minD, maxD) {
    var lastDay = new Date(y, m, 0).getDate();
    var start = isoFromYmd(y, m, 1);
    var end = isoFromYmd(y, m, lastDay);
    if (minD && end < minD) return false;
    if (maxD && start > maxD) return false;
    return true;
  }

  function ensureCalPopover() {
    if (calPopover) return calPopover;
    calPopover = document.createElement("div");
    calPopover.id = "rb-date-popover";
    calPopover.className = "date-popover hidden";
    document.body.appendChild(calPopover);
    calPopover.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });
    calPopover.addEventListener("click", function (e) {
      e.stopPropagation();
      var btn = e.target.closest("[data-cal-action]");
      if (!btn || !calAnchor || btn.disabled) return;
      var minD = calAnchor.dataset.minDate || "";
      var maxD = calAnchor.dataset.maxDate || "";
      var action = btn.getAttribute("data-cal-action");
      if (action === "prev") {
        calView = shiftMonth(calView.y, calView.m, -1);
        renderCalPopover(minD, maxD);
        return;
      }
      if (action === "next") {
        calView = shiftMonth(calView.y, calView.m, 1);
        renderCalPopover(minD, maxD);
        return;
      }
      if (action === "pick") {
        var iso = btn.getAttribute("data-iso") || "";
        if (!iso || dateOutOfBounds(iso, minD, maxD)) return;
        calAnchor.value = formatDateBR(iso);
        closeCalPopover();
        applyFilters();
      }
    });
    document.addEventListener("mousedown", function (e) {
      if (!calPopover || calPopover.classList.contains("hidden") || !calAnchor) return;
      if (e.target && e.target.isConnected === false) return;
      if (calPopover.contains(e.target)) return;
      if (calAnchor.contains(e.target)) return;
      if (calAnchor.parentElement && calAnchor.parentElement.contains(e.target)) return;
      closeCalPopover();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeCalPopover();
    });
    return calPopover;
  }

  function renderCalPopover(minD, maxD) {
    var pop = ensureCalPopover();
    var selectedIso = calAnchor ? brDateToIso(calAnchor.value) : "";
    var first = new Date(calView.y, calView.m - 1, 1);
    var startWeekday = first.getDay();
    var daysInMonth = new Date(calView.y, calView.m, 0).getDate();
    var prev = shiftMonth(calView.y, calView.m, -1);
    var next = shiftMonth(calView.y, calView.m, 1);
    var prevOk = monthIntersectsRange(prev.y, prev.m, minD, maxD);
    var nextOk = monthIntersectsRange(next.y, next.m, minD, maxD);
    var cells = [];
    var i;
    for (i = 0; i < startWeekday; i += 1) cells.push(null);
    for (i = 1; i <= daysInMonth; i += 1) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);

    var html =
      '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-cal-action="prev" aria-label="Mês anterior"' +
      (prevOk ? "" : " disabled") +
      ">‹</button>" +
      '<div class="cal-title">' + esc(CAL_MONTHS[calView.m - 1]) + " " + calView.y + "</div>" +
      '<button type="button" class="cal-nav" data-cal-action="next" aria-label="Próximo mês"' +
      (nextOk ? "" : " disabled") +
      ">›</button>" +
      "</div>" +
      '<div class="cal-weekdays">' +
      CAL_WEEK.map(function (w) { return "<span>" + w + "</span>"; }).join("") +
      "</div>" +
      '<div class="cal-grid">';

    for (i = 0; i < cells.length; i += 1) {
      var day = cells[i];
      if (!day) {
        html += '<span aria-hidden="true"></span>';
        continue;
      }
      var iso = isoFromYmd(calView.y, calView.m, day);
      var disabled = dateOutOfBounds(iso, minD, maxD);
      var cls = "cal-day";
      if (selectedIso === iso) cls += " is-selected";
      html +=
        '<button type="button" class="' + cls + '"' +
        ' data-cal-action="pick" data-iso="' + iso + '"' +
        (disabled ? " disabled" : "") + ">" + day + "</button>";
    }
    html += "</div>";
    pop.innerHTML = html;
  }

  function positionCalPopover(textEl) {
    if (!calPopover || !textEl) return;
    var rect = textEl.getBoundingClientRect();
    var top = rect.bottom + 6;
    var left = rect.left;
    if (left + 280 > window.innerWidth - 8) left = window.innerWidth - 288;
    if (left < 8) left = 8;
    if (top + 320 > window.innerHeight - 8) top = Math.max(8, rect.top - 326);
    calPopover.style.top = top + "px";
    calPopover.style.left = left + "px";
  }

  function openCalPopover(textEl) {
    if (!textEl) return;
    calAnchor = textEl;
    var minD = textEl.dataset.minDate || "";
    var maxD = textEl.dataset.maxDate || "";
    var selectedIso = brDateToIso(textEl.value);
    var startIso = selectedIso;
    if (!startIso) {
      startIso = textEl === els.fDataAte ? maxD || minD : minD || maxD;
    }
    var p = parseIsoParts(startIso);
    if (p) {
      calView.y = p.y;
      calView.m = p.m;
    } else {
      var now = new Date();
      calView.y = now.getFullYear();
      calView.m = now.getMonth() + 1;
    }
    renderCalPopover(minD, maxD);
    ensureCalPopover().classList.remove("hidden");
    positionCalPopover(textEl);
  }

  function closeCalPopover() {
    if (!calPopover) return;
    calPopover.classList.add("hidden");
    calAnchor = null;
  }

  function bindBrDateField(textEl) {
    if (!textEl) return;
    var btn = textEl.parentElement && textEl.parentElement.querySelector(".date-picker-btn");
    textEl.addEventListener("click", function () {
      openCalPopover(textEl);
    });
    textEl.addEventListener("keydown", function (e) {
      e.preventDefault();
    });
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        openCalPopover(textEl);
      });
    }
  }

  function setDateBounds(textEl, minD, maxD, hint) {
    if (!textEl) return;
    textEl.title = hint || "Clique para selecionar a data";
    if (minD) textEl.dataset.minDate = minD;
    else delete textEl.dataset.minDate;
    if (maxD) textEl.dataset.maxDate = maxD;
    else delete textEl.dataset.maxDate;
  }

  function clearDateField(textEl) {
    if (!textEl) return;
    textEl.value = "";
  }

  function parseMoney(raw) {
    if (raw == null || raw === "") return 0;
    var s = String(raw).trim();
    if (!s) return 0;
    s = s.replace(/\./g, "").replace(",", ".");
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    var da = new Date(a + "T00:00:00");
    var db = new Date(b + "T00:00:00");
    if (isNaN(da) || isNaN(db)) return null;
    return Math.round((db - da) / 86400000);
  }

  function formatBR(n) {
    return Number(n || 0).toLocaleString("pt-BR");
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 2,
    });
  }

  function formatMoneyCsv(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportFilteredExcel() {
    var rows = sortedFilteredRows();
    if (!rows.length) return;
    var headers = [
      "NF",
      "Serie",
      "Empresa",
      "Fornecedor",
      "Emissao",
      "Entrada",
      "CGO",
      "Valor",
      "Situacao",
      "Conferencia",
    ];
    var lines = [headers.join(";")];
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      lines.push(
        [
          r.nf || "",
          r.serie || "",
          r.empresa || "",
          r.fornecedor || "",
          formatDateBR(r.dataEmissao),
          formatDateBR(r.dataEntrada),
          r.cgo || "",
          formatMoneyCsv(r.valor),
          r.situacao || "",
          r.sitConf || "",
        ]
          .map(csvEscape)
          .join(";")
      );
    }

    var f = getFilters();
    var name = "notas-filtradas";
    if (f.de && f.ate) name += "-" + f.de + "-a-" + f.ate;
    else if (f.de) name += "-de-" + f.de;
    else if (f.ate) name += "-ate-" + f.ate;
    name += ".csv";

    var blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function formatMoneyShort(n) {
    var v = Number(n || 0);
    if (Math.abs(v) >= 1e6) {
      return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
    }
    if (Math.abs(v) >= 1e3) {
      return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
    }
    return formatMoney(v);
  }

  function formatDateBR(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tagClass(sit) {
    var s = String(sit || "").toUpperCase();
    if (s === "RECEBIDA") return "tag-ok";
    if (s === "XML") return "tag-xml";
    if (s === "RECEBIMENTO") return "tag-rec";
    if (s === "CONFERENCIA" || s === "CONFERÊNCIA") return "tag-conf";
    if (s === "NOTA LIBERADA") return "tag-lib";
    return "tag-other";
  }

  function sitLabel(sit) {
    var s = String(sit || "").trim();
    if (!s) return "—";
    if (s === "NOTA LIBERADA") return "Nota liberada";
    if (s === "CONFERENCIA") return "Conferência";
    return s.charAt(0) + s.slice(1).toLowerCase();
  }

  function sitFillClass(sit) {
    var s = String(sit || "").toUpperCase();
    if (s === "RECEBIDA") return "black";
    if (s === "XML") return "amber";
    if (s === "RECEBIMENTO") return "blue";
    if (s === "CONFERENCIA" || s === "CONFERÊNCIA") return "purple";
    return "gray";
  }

  function empresaCode(empresa) {
    var s = String(empresa || "").trim();
    if (!s) return "";
    var i = s.indexOf("-");
    return (i >= 0 ? s.slice(0, i) : s).trim().toUpperCase();
  }

  function fornecedorCode(fornecedor) {
    var s = String(fornecedor || "").trim();
    if (!s) return "";
    var i = s.indexOf("-");
    return (i >= 0 ? s.slice(0, i) : s).trim();
  }

  /** Regras fixas: exclui C001/C038/R066/C034, fornecedor 331 e Rio Grande (exceto código 10). */
  function isBusinessExcluded(row) {
    var emp = empresaCode(row.empresa);
    if (EXCLUDED_EMPRESA_CODES[emp]) return true;

    var fornCode = fornecedorCode(row.fornecedor);
    if (EXCLUDED_FORNECEDOR_CODES[fornCode]) return true;

    var forn = String(row.fornecedor || "").toUpperCase();
    if (forn.indexOf(RIO_GRANDE_NAME) >= 0) {
      if (fornCode !== RIO_GRANDE_KEEP_CODE) return true;
    }
    return false;
  }

  function applyBusinessRules(rows) {
    rawCount = rows.length;
    var kept = [];
    for (var i = 0; i < rows.length; i++) {
      if (!isBusinessExcluded(rows[i])) kept.push(rows[i]);
    }
    excludedCount = rawCount - kept.length;
    return kept;
  }

  function decodeBaseText(buffer) {
    var bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    // Prefer Windows-1252 (arquivo do ERP); se vier UTF-8 válido, usa UTF-8.
    var asLatin = new TextDecoder("windows-1252").decode(bytes);
    var asUtf = new TextDecoder("utf-8").decode(bytes);
    if (asUtf.indexOf("\uFFFD") >= 0) return asLatin;
    // Poucos bytes altos: ainda pode ser 1252 com 1–2 acentos.
    var high = 0;
    for (var i = 0; i < bytes.length; i++) if (bytes[i] >= 0x80) high++;
    if (high > 0 && high < 50 && /CONFER[\u00C9\u00CA]NCIA|[\u00C7\u00E7]/.test(asLatin)) {
      return asLatin;
    }
    return asUtf;
  }

  function normalizeSituacao(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    s = s.replace(/CONFER[\u00C9\u00CA\u00C8]NCIA/gi, "CONFERENCIA");
    return s;
  }

  function parseCsv(text) {
    var lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
    if (!lines.length) return [];
    var header = lines[0].split(";");
    var idx = {};
    for (var i = 0; i < header.length; i++) {
      idx[header[i].trim()] = i;
    }

    function col(parts, name) {
      var j = idx[name];
      return j == null ? "" : (parts[j] != null ? parts[j] : "");
    }

    var rows = [];
    for (var li = 1; li < lines.length; li++) {
      var line = lines[li];
      if (!line || !line.trim()) continue;
      var parts = line.split(";");
      var dataEmissao = parseDate(col(parts, "DATA_EMISSAO"));
      var dataEntrada = parseDate(col(parts, "DATA_ENTRADA"));
      var valor = parseMoney(col(parts, "VALOR_TOTAL"));
      var situacao = normalizeSituacao(col(parts, "SITUACAO_"));
      var empresa = (col(parts, "EMPRESA") || "").trim();
      var fornecedor = (col(parts, "FORNECEDOR") || "").trim();
      var cgo = (col(parts, "CGO") || "").trim();
      var chave = (col(parts, "CHAVE_ACESSO") || "").trim();
      var nf = (col(parts, "NUMERO_NF") || "").trim();
      var serie = (col(parts, "SERIE") || "").trim();
      var sitConf = (col(parts, "SITUACAO_CONFERENCIA") || "").trim();
      var atraso = daysBetween(dataEmissao, dataEntrada);

      rows.push({
        nf: nf,
        serie: serie,
        empresa: empresa,
        fornecedor: fornecedor,
        dataEmissao: dataEmissao,
        dataEntrada: dataEntrada,
        cgo: cgo,
        valor: valor,
        situacao: situacao,
        sitConf: sitConf,
        chave: chave,
        atraso: atraso,
        search: (nf + " " + fornecedor + " " + chave + " " + empresa).toLowerCase(),
      });
    }
    return rows;
  }

  function uniqueSorted(arr) {
    var map = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i]) map[arr[i]] = true;
    }
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR");
    });
  }

  function fillSelect(select, values, placeholder, labels) {
    if (!select) return;
    labels = labels || {};
    var current = select.value;
    var html = '<option value="">' + esc(placeholder) + "</option>";
    for (var i = 0; i < values.length; i++) {
      var val = values[i];
      html +=
        '<option value="' + esc(val) + '">' + esc(labels[val] || val) + "</option>";
    }
    select.innerHTML = html;
    if (current && values.indexOf(current) >= 0) select.value = current;
  }

  function populateFilterOptions() {
    var sits = uniqueSorted(allRows.map(function (r) { return r.situacao; }));
    sits.sort(function (a, b) {
      var ia = SIT_ORDER.indexOf(a);
      var ib = SIT_ORDER.indexOf(b);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "pt-BR");
    });
    fillSelect(els.fSituacao, sits, "Todas");

    var segs = segmentosDisponiveis();
    var segLabels = {};
    for (var s = 0; s < segs.length; s++) segLabels[segs[s]] = segmentoLabel(segs[s]);
    var grupoAtual = els.fGrupo ? els.fGrupo.value : "";
    fillSelect(els.fGrupo, segs, "Todos", segLabels);
    if (grupoAtual && segs.indexOf(grupoAtual) >= 0) els.fGrupo.value = grupoAtual;

    fillSelect(
      els.fEmpresa,
      empresasForGrupo(els.fGrupo ? els.fGrupo.value : ""),
      "Todas"
    );

    var minD = "";
    var maxD = "";
    for (var i = 0; i < allRows.length; i++) {
      var d = allRows[i].dataEntrada;
      if (!d) continue;
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }
    var hint =
      minD && maxD
        ? "Período na base: " + formatDateBR(minD) + " a " + formatDateBR(maxD)
        : "";
    setDateBounds(els.fDataDe, minD, maxD, hint);
    setDateBounds(els.fDataAte, minD, maxD, hint);
  }

  function getFilters() {
    return {
      de: brDateToIso(els.fDataDe.value),
      ate: brDateToIso(els.fDataAte.value),
      situacao: els.fSituacao.value || "",
      grupo: els.fGrupo && els.fGrupo.value ? els.fGrupo.value : "",
      empresa: els.fEmpresa.value || "",
    };
  }

  function matchFilters(r, f, opts) {
    opts = opts || {};
    if (f.de && (!r.dataEntrada || r.dataEntrada < f.de)) return false;
    if (f.ate && (!r.dataEntrada || r.dataEntrada > f.ate)) return false;
    if (!opts.ignoreSituacao && f.situacao && r.situacao !== f.situacao) return false;
    if (f.grupo && segmentoEmpresa(r.empresa) !== f.grupo) return false;
    if (f.empresa && r.empresa !== f.empresa) return false;
    return true;
  }

  function applyFilters() {
    var f = getFilters();
    filtered = allRows.filter(function (r) {
      return matchFilters(r, f);
    });
    page = 0;
    renderAll();
  }

  function aggBy(rows, keyFn) {
    var map = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var k = keyFn(r);
      if (!map[k]) map[k] = { key: k, count: 0, valor: 0 };
      map[k].count += 1;
      map[k].valor += r.valor;
    }
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function lojaShortLabel(empresa) {
    if (!empresa) return "—";
    var loja = String(empresa);
    if (loja.indexOf("-") >= 0) loja = loja.split("-").slice(1).join("-").trim();
    if (loja.length > 20) loja = loja.slice(0, 18) + "…";
    return loja || empresa;
  }

  function topLojasByStatus(rows, status, limit) {
    var map = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.situacao !== status) continue;
      var emp = r.empresa || "(sem loja)";
      map[emp] = (map[emp] || 0) + 1;
    }
    var list = Object.keys(map).map(function (emp) {
      return { empresa: emp, count: map[emp] };
    });
    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.empresa.localeCompare(b.empresa, "pt-BR");
    });
    return list.slice(0, limit || 3);
  }

  function renderKpiLojasFoot(rows, status) {
    var top = topLojasByStatus(rows, status, 3);
    if (!top.length) return "";
    var html = '<div class="kpi-foot">';
    for (var i = 0; i < top.length; i++) {
      html +=
        '<span class="kpi-loja" title="' + esc(top[i].empresa) + '">' +
        esc(lojaShortLabel(top[i].empresa)) +
        " · " +
        formatBR(top[i].count) +
        "</span>";
    }
    html += "</div>";
    return html;
  }

  function renderKpis(rows) {
    var totalValor = 0;
    var bySit = Object.create(null);

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      totalValor += r.valor;
      bySit[r.situacao] = (bySit[r.situacao] || 0) + 1;
    }

    var items = [
      { v: formatBR(rows.length), l: "Total de notas", cls: "" },
      { v: formatMoneyShort(totalValor), l: "Valor total", cls: "" },
    ];

    var sitMeta = [
      { key: "RECEBIDA", cls: "good" },
      { key: "XML", cls: "warn" },
      { key: "RECEBIMENTO", cls: "info" },
      { key: "CONFERENCIA", cls: "" },
      { key: "NOTA LIBERADA", cls: "" },
    ];

    for (var s = 0; s < sitMeta.length; s++) {
      var sm = sitMeta[s];
      var sitCount = bySit[sm.key] || 0;
      items.push({
        v: formatBR(sitCount),
        l: sm.key.charAt(0) + sm.key.slice(1).toLowerCase(),
        cls: sm.cls,
        foot: sitCount > 0 ? renderKpiLojasFoot(rows, sm.key) : "",
      });
    }

    var html = "";
    for (var j = 0; j < items.length; j++) {
      html +=
        '<article class="card ' + items[j].cls + (items[j].foot ? " has-foot" : "") + '">' +
        '<div class="lbl">' + esc(items[j].l) + "</div>" +
        '<div class="val">' + esc(items[j].v) + "</div>" +
        (items[j].foot || "") +
        "</article>";
    }
    els.kpiGrid.innerHTML = html;
    els.kpiCaption.textContent =
      formatBR(rows.length) + " notas no recorte · " + formatMoney(totalValor);
  }

  function renderFunil(rows) {
    // Sempre mostra todas as situações do SIT_ORDER (mesmo com filtro de situação),
    // para o funil não colapsar em uma única barra.
    var bySitMap = Object.create(null);
    for (var s = 0; s < SIT_ORDER.length; s++) {
      bySitMap[SIT_ORDER[s]] = { key: SIT_ORDER[s], count: 0, valor: 0 };
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var k = r.situacao || "(vazio)";
      if (!bySitMap[k]) bySitMap[k] = { key: k, count: 0, valor: 0 };
      bySitMap[k].count += 1;
      bySitMap[k].valor += r.valor;
    }

    var bySit = Object.keys(bySitMap).map(function (k) { return bySitMap[k]; });
    bySit.sort(function (a, b) {
      var ia = SIT_ORDER.indexOf(a.key);
      var ib = SIT_ORDER.indexOf(b.key);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      if (ia !== ib) return ia - ib;
      return b.count - a.count;
    });

    if (!rows.length) {
      els.funilBars.innerHTML = '<div class="empty">Sem dados no filtro atual.</div>';
      return;
    }

    var totalCount = 0;
    for (var t = 0; t < bySit.length; t++) totalCount += bySit[t].count;
    if (!totalCount) totalCount = 1;

    var html = "";
    var sitFiltro = getFilters().situacao;
    for (var j = 0; j < bySit.length; j++) {
      var item = bySit[j];
      if (item.count === 0 && SIT_ORDER.indexOf(item.key) < 0) continue;
      var pctTotal = (100 * item.count) / totalCount;
      var active = !sitFiltro || sitFiltro === item.key;
      var fillCls = sitFillClass(item.key);
      html +=
        '<div class="funil-row ' + fillCls + (active ? "" : " dim") + '">' +
        '<div class="funil-line">' +
        '<span class="funil-label">' + esc(sitLabel(item.key)) + "</span>" +
        '<span class="funil-count">' + formatBR(item.count) + "</span>" +
        '<span class="funil-val">' + formatMoneyShort(item.valor) + "</span>" +
        '<span class="funil-pct">' +
        pctTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
        "%</span>" +
        "</div>" +
        '<div class="track"><div class="fill ' + fillCls + '" style="width:' + pctTotal.toFixed(1) + '%"></div></div>' +
        "</div>";
    }
    els.funilBars.innerHTML = html;
  }

  function renderRitmo(rows) {
    var byDay = aggBy(rows, function (r) { return r.dataEntrada || "(sem data)"; });
    byDay.sort(function (a, b) {
      if (a.key === "(sem data)") return 1;
      if (b.key === "(sem data)") return -1;
      return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
    });

    var sitKeys = {};
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].situacao) sitKeys[rows[i].situacao] = true;
    }
    var sits = Object.keys(sitKeys).sort(function (a, b) {
      var ia = SIT_ORDER.indexOf(a);
      var ib = SIT_ORDER.indexOf(b);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      return ia - ib || a.localeCompare(b);
    });
    if (sits.length > 4) sits = sits.slice(0, 4);

    var daySit = Object.create(null);
    for (var r = 0; r < rows.length; r++) {
      var day = rows[r].dataEntrada || "(sem data)";
      var sit = rows[r].situacao || "(vazio)";
      if (!daySit[day]) daySit[day] = Object.create(null);
      daySit[day][sit] = (daySit[day][sit] || 0) + 1;
    }

    if (!byDay.length) {
      els.ritmoTableWrap.innerHTML = '<div class="empty">Sem dados no filtro atual.</div>';
      return;
    }

    var show = byDay.slice(0, 14);
    var head =
      "<thead><tr><th>Entrada</th><th class=\"num\">NFs</th><th class=\"num\">Valor</th>";
    for (var s = 0; s < sits.length; s++) {
      head += '<th class="num">' + esc(sits[s]) + "</th>";
    }
    head += "</tr></thead>";

    var body = "<tbody>";
    for (var d = 0; d < show.length; d++) {
      var item = show[d];
      body +=
        "<tr><td>" +
        esc(item.key === "(sem data)" ? item.key : formatDateBR(item.key)) +
        '</td><td class="num">' +
        formatBR(item.count) +
        '</td><td class="num">' +
        formatMoneyShort(item.valor) +
        "</td>";
      for (var si = 0; si < sits.length; si++) {
        var c = (daySit[item.key] && daySit[item.key][sits[si]]) || 0;
        body += '<td class="num">' + formatBR(c) + "</td>";
      }
      body += "</tr>";
    }
    body += "</tbody>";
    els.ritmoTableWrap.innerHTML = "<table>" + head + body + "</table>";
  }

  function renderTopTable(container, rows, keyFn, label, limit) {
    var items = aggBy(rows, keyFn);
    items.sort(function (a, b) {
      if (b.valor !== a.valor) return b.valor - a.valor;
      return b.count - a.count;
    });
    items = items.slice(0, limit || 8);

    var totalValor = 0;
    for (var i = 0; i < rows.length; i++) totalValor += rows[i].valor;
    if (!totalValor) totalValor = 1;

    if (!items.length) {
      container.innerHTML = '<div class="empty">Sem dados no filtro atual.</div>';
      return;
    }

    var html =
      "<table><thead><tr><th>" +
      esc(label) +
      '</th><th class="num">NFs</th><th class="num">Valor</th><th class="num">Part.</th></tr></thead><tbody>';
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var part = (100 * it.valor) / totalValor;
      html +=
        "<tr><td class=\"truncate\" title=\"" +
        esc(it.key) +
        "\">" +
        esc(it.key) +
        '</td><td class="num">' +
        formatBR(it.count) +
        '</td><td class="num">' +
        formatMoney(it.valor) +
        '</td><td class="num">' +
        part.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
        "%</td></tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  function renderMaiores(rows) {
    var sorted = rows.slice().sort(function (a, b) {
      return b.valor - a.valor;
    }).slice(0, 10);

    if (!sorted.length) {
      els.maioresTableWrap.innerHTML = '<div class="empty">Sem dados no filtro atual.</div>';
      return;
    }

    var html =
      '<table><thead><tr><th>NF</th><th>Loja</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>';
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      var loja = r.empresa || "—";
      if (loja.indexOf("-") >= 0) loja = loja.split("-").slice(1).join("-");
      html +=
        "<tr><td>" +
        esc(r.nf || "—") +
        '</td><td class="truncate" title="' +
        esc(r.empresa) +
        '">' +
        esc(loja) +
        '</td><td><span class="tag ' +
        tagClass(r.situacao) +
        '">' +
        esc(r.situacao || "—") +
        '</span></td><td class="num">' +
        formatMoney(r.valor) +
        "</td></tr>";
    }
    html += "</tbody></table>";
    els.maioresTableWrap.innerHTML = html;
  }

  function renderCgo(rows) {
    renderTopTable(
      els.cgoTableWrap,
      rows,
      function (r) { return r.cgo || "(vazio)"; },
      "CGO",
      8
    );
  }

  function renderQualidade(rows) {
    var semChave = 0;
    var semCgo = 0;
    var atraso7 = 0;
    var atraso30 = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.chave) semChave++;
      if (!r.cgo) semCgo++;
      if (r.atraso != null && r.atraso > 7) atraso7++;
      if (r.atraso != null && r.atraso > 30) atraso30++;
    }
    els.qualidadeChips.innerHTML =
      '<article class="card warn"><div class="lbl">NF sem chave</div><div class="val">' + formatBR(semChave) + "</div></article>" +
      '<article class="card warn"><div class="lbl">Sem CGO</div><div class="val">' + formatBR(semCgo) + "</div></article>" +
      '<article class="card"><div class="lbl">Atraso &gt; 7 dias</div><div class="val">' + formatBR(atraso7) + "</div></article>" +
      '<article class="card bad"><div class="lbl">Atraso &gt; 30 dias</div><div class="val">' + formatBR(atraso30) + "</div></article>";
  }

  function defaultDetailSortDir(key) {
    if (key === "valor" || key === "dataEntrada" || key === "dataEmissao" || key === "nf") {
      return "desc";
    }
    return "asc";
  }

  function compareDetailRows(a, b) {
    var key = detailSort.key;
    var dir = detailSort.dir === "asc" ? 1 : -1;
    var va;
    var vb;
    var cmp = 0;

    if (key === "valor") {
      cmp = (Number(a.valor) || 0) - (Number(b.valor) || 0);
    } else if (key === "dataEmissao" || key === "dataEntrada") {
      va = a[key] || "";
      vb = b[key] || "";
      cmp = va < vb ? -1 : va > vb ? 1 : 0;
    } else if (key === "nf") {
      va = Number(a.nf);
      vb = Number(b.nf);
      if (Number.isFinite(va) && Number.isFinite(vb) && va !== vb) {
        cmp = va - vb;
      } else {
        cmp = String(a.nf || "").localeCompare(String(b.nf || ""), "pt-BR", { numeric: true });
      }
    } else {
      va = String(a[key] || "");
      vb = String(b[key] || "");
      cmp = va.localeCompare(vb, "pt-BR", { numeric: true, sensitivity: "base" });
    }
    if (cmp !== 0) return dir * cmp;
    return String(a.nf || "").localeCompare(String(b.nf || ""), "pt-BR", { numeric: true });
  }

  function sortedFilteredRows() {
    return filtered.slice().sort(compareDetailRows);
  }

  function detailSortTh(key, label, isNum) {
    var active = detailSort.key === key;
    var aria = active ? (detailSort.dir === "asc" ? ' aria-sort="ascending"' : ' aria-sort="descending"') : ' aria-sort="none"';
    var cls = "sortable" + (isNum ? " num" : "") + (active ? " is-sorted" : "");
    var arrow = active ? (detailSort.dir === "asc" ? "▲" : "▼") : "↕";
    return (
      '<th class="' + cls + '" data-sort="' + key + '" scope="col"' + aria +
      ' title="Ordenar por ' + esc(label) + '">' +
      esc(label) +
      '<span class="sort-ind" aria-hidden="true">' + arrow + "</span></th>"
    );
  }

  function onDetailSortClick(ev) {
    var th = ev.target.closest("th[data-sort]");
    if (!th || !els.detailTableWrap.contains(th)) return;
    var key = th.getAttribute("data-sort");
    if (!key) return;
    if (detailSort.key === key) {
      detailSort.dir = detailSort.dir === "asc" ? "desc" : "asc";
    } else {
      detailSort.key = key;
      detailSort.dir = defaultDetailSortDir(key);
    }
    page = 0;
    renderDetail();
  }

  function renderDetail() {
    var rows = sortedFilteredRows();
    var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    var start = page * PAGE_SIZE;
    var slice = rows.slice(start, start + PAGE_SIZE);

    els.tableCaption.textContent =
      formatBR(rows.length) + " notas · página " + (page + 1) + " de " + totalPages;

    if (!rows.length) {
      els.detailTableWrap.innerHTML = '<div class="empty">Nenhuma nota no filtro atual.</div>';
      els.pagerInfo.textContent = "0 notas";
      els.btnPrevPage.disabled = true;
      els.btnNextPage.disabled = true;
      if (els.btnExportExcel) els.btnExportExcel.disabled = true;
      return;
    }

    if (els.btnExportExcel) els.btnExportExcel.disabled = false;

    var html =
      "<table><thead><tr>" +
      detailSortTh("nf", "NF", false) +
      detailSortTh("serie", "Série", false) +
      detailSortTh("empresa", "Empresa", false) +
      detailSortTh("fornecedor", "Fornecedor", false) +
      detailSortTh("dataEmissao", "Emissão", false) +
      detailSortTh("dataEntrada", "Entrada", false) +
      detailSortTh("cgo", "CGO", false) +
      detailSortTh("valor", "Valor", true) +
      detailSortTh("situacao", "Situação", false) +
      detailSortTh("sitConf", "Conferência", false) +
      "</tr></thead><tbody>";

    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      html +=
        "<tr>" +
        "<td>" + esc(r.nf) + "</td>" +
        "<td>" + esc(r.serie) + "</td>" +
        '<td class="truncate" title="' + esc(r.empresa) + '">' + esc(r.empresa) + "</td>" +
        '<td class="truncate" title="' + esc(r.fornecedor) + '">' + esc(r.fornecedor) + "</td>" +
        "<td>" + esc(formatDateBR(r.dataEmissao)) + "</td>" +
        "<td>" + esc(formatDateBR(r.dataEntrada)) + "</td>" +
        "<td>" + esc(r.cgo || "—") + "</td>" +
        '<td class="num">' + formatMoney(r.valor) + "</td>" +
        '<td><span class="tag ' + tagClass(r.situacao) + '">' + esc(r.situacao || "—") + "</span></td>" +
        "<td>" + esc(r.sitConf || "—") + "</td>" +
        "</tr>";
    }
    html += "</tbody></table>";
    els.detailTableWrap.innerHTML = html;

    var end = Math.min(start + PAGE_SIZE, rows.length);
    els.pagerInfo.textContent =
      "Mostrando " + formatBR(start + 1) + "–" + formatBR(end) + " de " + formatBR(rows.length);
    els.btnPrevPage.disabled = page <= 0;
    els.btnNextPage.disabled = page >= totalPages - 1;
  }

  function renderAll() {
    var f = getFilters();
    // Funil e KPIs ignoram o filtro de situação para manter a visão geral.
    var rowsFunil = allRows.filter(function (r) {
      return matchFilters(r, f, { ignoreSituacao: true });
    });

    renderKpis(rowsFunil);
    renderFunil(rowsFunil);
    renderRitmo(filtered);
    renderTopTable(
      els.lojasTableWrap,
      filtered,
      function (r) { return r.empresa || "(sem empresa)"; },
      "Empresa",
      8
    );
    renderTopTable(
      els.fornecedoresTableWrap,
      filtered,
      function (r) { return r.fornecedor || "(sem fornecedor)"; },
      "Fornecedor",
      8
    );
    renderMaiores(filtered);
    renderCgo(filtered);
    renderQualidade(filtered);
    renderDetail();

    var empresas = Object.create(null);
    var forn = Object.create(null);
    for (var i = 0; i < filtered.length; i++) {
      if (filtered[i].empresa) empresas[filtered[i].empresa] = true;
      if (filtered[i].fornecedor) forn[filtered[i].fornecedor] = true;
    }
    if (els.headerSub) {
      els.headerSub.textContent =
        "Dashboard operacional · " +
        formatBR(filtered.length) +
        " notas · " +
        formatBR(Object.keys(empresas).length) +
        " lojas · " +
        formatBR(Object.keys(forn).length) +
        " fornecedores";
    }
  }

  function onDataLoaded(rows, sourceLabel) {
    loadEmpresasBase();
    allRows = applyBusinessRules(rows);
    els.loadBanner.classList.remove("show");
    setStatus(
      formatBR(allRows.length) +
        " notas · " +
        sourceLabel +
        " · −" +
        formatBR(excludedCount) +
        " excl.",
      "ok"
    );
    populateFilterOptions();
    applyFilters();
  }

  function onLoadError(msg) {
    setStatus("Falha ao carregar", "err");
    els.loadBanner.classList.add("show");
    els.kpiGrid.innerHTML = "";
    els.kpiCaption.textContent = msg || "Sem dados";
    els.funilBars.innerHTML = '<div class="empty"><strong>Sem dados.</strong><br>Carregue o arquivo da pasta Bases.</div>';
    els.ritmoTableWrap.innerHTML = "";
    els.lojasTableWrap.innerHTML = "";
    els.fornecedoresTableWrap.innerHTML = "";
    els.maioresTableWrap.innerHTML = "";
    els.cgoTableWrap.innerHTML = "";
    els.qualidadeChips.innerHTML = "";
    els.detailTableWrap.innerHTML = "";
  }

  async function loadFromFetch() {
    setStatus("Carregando Base…", "warn");
    var res = await fetch(DATA_PATH + "?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    var buf = await res.arrayBuffer();
    var text = decodeBaseText(buf);
    var rows = parseCsv(text);
    if (!rows.length) throw new Error("Arquivo vazio");
    onDataLoaded(rows, "fetch");
  }

  function loadFromFile(file) {
    setStatus("Lendo arquivo…", "warn");
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = decodeBaseText(reader.result);
        var rows = parseCsv(text);
        if (!rows.length) throw new Error("Arquivo vazio");
        onDataLoaded(rows, file.name);
      } catch (err) {
        onLoadError(err.message || String(err));
      }
    };
    reader.onerror = function () {
      onLoadError("Não foi possível ler o arquivo.");
    };
    reader.readAsArrayBuffer(file);
  }

  async function tryAutoLoad() {
    try {
      await loadFromFetch();
    } catch (err) {
      onLoadError(err.message || String(err));
    }
  }

  function pickFile() {
    els.fileInput.click();
  }

  var pickBtn = document.getElementById("rb-btnPickFile");
  if (pickBtn) pickBtn.addEventListener("click", pickFile);
  var pickBanner = document.getElementById("rb-btnPickFileBanner");
  if (pickBanner) pickBanner.addEventListener("click", pickFile);
  var reloadBtn = document.getElementById("rb-btnReload");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", function () {
      tryAutoLoad();
    });
  }

  els.fileInput.addEventListener("change", function () {
    var file = els.fileInput.files && els.fileInput.files[0];
    if (file) loadFromFile(file);
    els.fileInput.value = "";
  });

  document.getElementById("rb-btnClearFilters").addEventListener("click", function () {
    clearDateField(els.fDataDe);
    clearDateField(els.fDataAte);
    els.fSituacao.value = "";
    if (els.fGrupo) els.fGrupo.value = "";
    els.fEmpresa.value = "";
    populateFilterOptions();
    applyFilters();
  });

  function onGrupoChange() {
    var grupo = els.fGrupo ? els.fGrupo.value : "";
    var empresaAtual = els.fEmpresa.value || "";
    fillSelect(els.fEmpresa, empresasForGrupo(grupo), "Todas");
    if (empresaAtual && empresasForGrupo(grupo).indexOf(empresaAtual) >= 0) {
      els.fEmpresa.value = empresaAtual;
    }
    applyFilters();
  }

  ["change", "input"].forEach(function (ev) {
    els.fSituacao.addEventListener(ev, applyFilters);
    els.fEmpresa.addEventListener(ev, applyFilters);
  });
  if (els.fGrupo) {
    els.fGrupo.addEventListener("change", onGrupoChange);
  }

  bindBrDateField(els.fDataDe);
  bindBrDateField(els.fDataAte);

  if (els.btnExportExcel) {
    els.btnExportExcel.addEventListener("click", exportFilteredExcel);
  }

  if (els.detailTableWrap) {
    els.detailTableWrap.addEventListener("click", onDetailSortClick);
  }

  els.btnPrevPage.addEventListener("click", function () {
    if (page > 0) {
      page -= 1;
      renderDetail();
    }
  });

  els.btnNextPage.addEventListener("click", function () {
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page < totalPages - 1) {
      page += 1;
      renderDetail();
    }
  });

  tryAutoLoad();
}