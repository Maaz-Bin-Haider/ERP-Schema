/* ============================================================
   ACCOUNTS REPORTS  —  JavaScript  (v3-final)
   • Compact filter forms (party ledger + cash ledger)
   • Post-render table search/filter with row count
   • Professional branded PDF (header stripe + footer)
   • CSV exports visible rows only
   ============================================================ */

// ── Active report metadata (title, filters) shared by PDF/CSV ──
let _rMeta = { title: "Report", subtitle: "", filters: {} };

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function getCSRFToken() {
  for (let c of decodeURIComponent(document.cookie).split(";")) {
    c = c.trim();
    if (c.startsWith("csrftoken=")) return c.slice("csrftoken=".length);
  }
  return "";
}

function showLoader(msg = "Loading…") {
  Swal.fire({ title: msg, didOpen: () => Swal.showLoading(), allowOutsideClick: false });
}

function fmt(date) {
  // "2024-01-31" → "31 Jan 2024"
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}

// ═══════════════════════════════════════════
// REPORT SELECTOR
// ═══════════════════════════════════════════
function selectReport(type) {
  $(".report-btn").removeClass("active");
  const btnMap = { ledger:"#btn-ledger", "cash-ledger":"#btn-cash-ledger",
                   receivable:"#btn-receivable", payable:"#btn-payable",
                   trial:"#btn-trial", ledger2:"#btn-ledger2" };
  $(btnMap[type] || "#btn-trial").addClass("active");

  // toggle ledger2 vs classic
  if (type === "ledger2") {
    $("#ledger2-section").show();
    $("#classic-section").hide();
    return;
  }
  $("#ledger2-section").hide();
  $("#classic-section").show();

  _clearTable();
  $("#report-form-container").empty();

  if      (type === "ledger")      renderLedgerForm();
  else if (type === "cash-ledger") renderCashLedgerForm();
  else if (type === "receivable")  fetchAccountsReceivable();
  else if (type === "payable")     fetchAccountsPayable();
  else                             fetchTrialBalance();
}

function _clearTable() {
  $("#reportHeader").html("");
  $("#reportBody").html(`<tr><td class="no-data">Select a report to view results</td></tr>`);
  $("#reportToolbar").remove();
}

// ═══════════════════════════════════════════
// FORM RENDERERS
// ═══════════════════════════════════════════

// ── Cash Ledger ──────────────────────────────────────────────
function renderCashLedgerForm() {
  const today = new Date().toISOString().split("T")[0];
  const yrStart = `${new Date().getFullYear()}-01-01`;

  $("#report-form-container").html(`
    <div class="filter-form">
      <div class="filter-field">
        <label><i class="fa-regular fa-calendar"></i>&nbsp;From Date</label>
        <input type="date" id="cash_from_date" value="${yrStart}" max="${today}">
      </div>
      <div class="filter-field">
        <label><i class="fa-regular fa-calendar"></i>&nbsp;To Date</label>
        <input type="date" id="cash_to_date" value="${today}" max="${today}">
      </div>
      <button class="generate-btn" onclick="fetchCashLedger()">
        <i class="fa-solid fa-bolt"></i> Generate
      </button>
    </div>
  `);
  $("#reportHeader").html("");
  $("#reportBody").html(`<tr><td class="no-data">Set a date range and click Generate</td></tr>`);
}

// ── Party Ledger ─────────────────────────────────────────────
function renderLedgerForm() {
  const today = new Date().toISOString().split("T")[0];

  $("#report-form-container").html(`
    <div class="filter-form">
      <div class="filter-field autocomplete-container">
        <label><i class="fa-solid fa-building"></i>&nbsp;Party Name</label>
        <input type="text" id="search_name" placeholder="Type to search party…"
               autocomplete="off" data-autocomplete-url="/parties/autocomplete-party?include_cash=1">
        <div id="suggestions" style="display:none;"></div>
      </div>
      <div class="filter-field">
        <label><i class="fa-regular fa-calendar"></i>&nbsp;From Date</label>
        <input type="date" id="from_date" value="2000-01-01">
      </div>
      <div class="filter-field">
        <label><i class="fa-regular fa-calendar"></i>&nbsp;To Date</label>
        <input type="date" id="to_date" value="${today}" max="${today}">
      </div>
      <button class="generate-btn" onclick="fetchLedgerReport()">
        <i class="fa-solid fa-bolt"></i> Generate
      </button>
    </div>
  `);
  $("#reportHeader").html("");
  $("#reportBody").html(`<tr><td class="no-data">Enter party name and date range, then click Generate</td></tr>`);
  initAutocomplete();
}

// ═══════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════

function fetchCashLedger() {
  const from = $("#cash_from_date").val();
  const to   = $("#cash_to_date").val();
  if (!from || !to) { Swal.fire("Missing Fields", "Please select both dates.", "warning"); return; }

  _rMeta = { title: "Cash Ledger", subtitle: "Cash account transactions",
             filters: { From: fmt(from), To: fmt(to) } };
  showLoader("Fetching Cash Ledger…");

  fetch("/accountsReports/cash-ledger/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify({ from_date: from, to_date: to })
  })
  .then(r => r.json())
  .then(data => { Swal.close(); data.error ? Swal.fire("Error", data.error, "error") : renderTable(data); })
  .catch(() => Swal.fire("Error", "Unable to fetch cash ledger data.", "error"));
}

function fetchLedgerReport() {
  const party = $("#search_name").val().trim();
  const from  = $("#from_date").val();
  const to    = $("#to_date").val();
  if (!party || !from || !to) { Swal.fire("Missing Fields", "Please fill all fields.", "warning"); return; }

  _rMeta = { title: "Party Ledger", subtitle: `Account statement for ${party}`,
             filters: { Party: party, From: fmt(from), To: fmt(to) } };
  showLoader("Fetching Ledger…");

  fetch("/accountsReports/detailed-ledger/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify({ party_name: party, from_date: from, to_date: to })
  })
  .then(r => r.json())
  .then(data => { Swal.close(); data.error ? Swal.fire("Error", data.error, "error") : renderTable(data); })
  .catch(() => Swal.fire("Error", "Unable to fetch ledger data.", "error"));
}

function fetchTrialBalance() {
  _rMeta = { title: "Trial Balance", subtitle: "Summary of all account balances", filters: {} };
  showLoader("Loading Trial Balance…");
  fetch("/accountsReports/trial-balance/", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() }
  })
  .then(r => r.json())
  .then(data => { Swal.close(); data.error ? Swal.fire("Error", data.error, "error") : renderTable(data); })
  .catch(() => Swal.fire("Error", "Unable to fetch trial balance.", "error"));
}

function fetchAccountsReceivable() {
  _rMeta = { title: "Accounts Receivable", subtitle: "Outstanding amounts owed to us", filters: {} };
  showLoader("Loading Receivables…");
  fetch("/accountsReports/accounts-receivable/", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() }
  })
  .then(async r => { const d = await r.json(); return typeof d === "string" ? JSON.parse(d) : d; })
  .then(data => { Swal.close(); data.error ? Swal.fire("Error", data.error, "error") : renderTable(data); })
  .catch(e => { console.error(e); Swal.fire("Error", "Unable to fetch Receivable.", "error"); });
}

function fetchAccountsPayable() {
  _rMeta = { title: "Accounts Payable", subtitle: "Outstanding amounts we owe", filters: {} };
  showLoader("Loading Payables…");
  fetch("/accountsReports/accounts-payable/", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() }
  })
  .then(async r => { const d = await r.json(); return typeof d === "string" ? JSON.parse(d) : d; })
  .then(data => { Swal.close(); data.error ? Swal.fire("Error", data.error, "error") : renderTable(data); })
  .catch(e => { console.error(e); Swal.fire("Error", "Unable to fetch Payable.", "error"); });
}

// ═══════════════════════════════════════════
// TABLE RENDERER
// ═══════════════════════════════════════════
const DISPLAY_ONLY_COLS = ["created_by"];

function renderTable(data) {
  const $header = $("#reportHeader");
  const $body   = $("#reportBody");

  if (!data || !data.length) {
    $header.html("");
    $body.html(`<tr><td class="no-data">No records found</td></tr>`);
    injectToolbar(0);
    return;
  }

  const cols = Object.keys(data[0]);

  $header.html(`<tr>${cols.map(c => {
    const isDisplay = DISPLAY_ONLY_COLS.includes(c);
    const label = c === "created_by" ? "Entry By" : c.replace(/_/g, " ");
    return isDisplay
      ? `<th data-no-export="1" class="col-entry-by">${label}</th>`
      : `<th>${label}</th>`;
  }).join("")}</tr>`);

  $body.html(data.map(row => `<tr>${cols.map(c => {
    const val = row[c] ?? "";
    if (DISPLAY_ONLY_COLS.includes(c)) {
      const pill = (val && val !== "N/A")
        ? `<span class="entry-by-pill"><i class="fa-solid fa-user-pen"></i> ${val}</span>`
        : `<span class="entry-by-pill entry-by-unknown">—</span>`;
      return `<td data-no-export="1" class="col-entry-by">${pill}</td>`;
    }
    return `<td>${val}</td>`;
  }).join("")}</tr>`).join(""));

  injectToolbar(data.length);
}

// ═══════════════════════════════════════════
// TOOLBAR — search filter + download buttons
// ═══════════════════════════════════════════
function injectToolbar(total) {
  $("#reportToolbar").remove();

  const $bar = $(`
    <div id="reportToolbar" class="report-toolbar">
      <div class="table-filter-bar">
        <div class="table-search-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="tableSearch" placeholder="Filter results…" autocomplete="off">
        </div>
        <span class="table-row-count" id="rowCount">${total} row${total !== 1 ? "s" : ""}</span>
      </div>
      <div class="table-actions">
        <button id="download_pdf" class="btn-download">
          <i class="fa-solid fa-file-pdf"></i> PDF
        </button>
        <button id="download_csv" class="btn-download btn-csv">
          <i class="fa-solid fa-file-csv"></i> CSV
        </button>
      </div>
    </div>
  `);

  $(".table-container").before($bar);

  // Live filter
  $("#tableSearch").on("input", function () {
    const q = this.value.toLowerCase().trim();
    let vis = 0;
    $("#reportBody tr").each(function () {
      const match = !q || $(this).text().toLowerCase().includes(q);
      $(this).toggleClass("filtered-out", !match);
      if (match) vis++;
    });
    $("#rowCount").text(`${vis} row${vis !== 1 ? "s" : ""}`);
  });
}

// ═══════════════════════════════════════════
// PDF  —  branded header + footer
// ═══════════════════════════════════════════
$(document).on("click", "#download_pdf", function () {
  const { jsPDF } = window.jspdf;

  // Find display-only col indices
  const allTh    = [...document.querySelectorAll("#reportTable thead th")];
  const skipCols = allTh.reduce((a, th, i) => { if (th.dataset.noExport === "1") a.push(i); return a; }, []);

  // Column headers for export
  const colHeaders = allTh.filter((_, i) => !skipCols.includes(i)).map(th => th.textContent.trim());

  // Visible rows for export
  const rowData = [];
  document.querySelectorAll("#reportBody tr:not(.filtered-out)").forEach(tr => {
    const cells = [];
    tr.querySelectorAll("td").forEach((td, i) => {
      if (!skipCols.includes(i)) cells.push(td.textContent.trim());
    });
    if (cells.length && !cells[0].includes("No records")) rowData.push(cells);
  });

  if (!rowData.length) { Swal.fire("No Data", "Nothing visible to export.", "warning"); return; }

  const doc    = new jsPDF("p", "pt", "a4");
  const pW     = doc.internal.pageSize.width;
  const pH     = doc.internal.pageSize.height;
  const today  = new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
  const m      = _rMeta;
  const fParts = Object.entries(m.filters || {}).map(([k, v]) => `${k}: ${v}`);

  // ── draw branded header ──
  function drawHeader(pg, total) {
    // Blue top bar
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pW, 38, "F");
    // App name
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text("Financee", 36, 25);
    // Report title (right)
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(m.title, pW - 36, 25, { align: "right" });
    // Light-blue sub-strip
    doc.setFillColor(239, 246, 255);
    doc.rect(0, 38, pW, 26, "F");
    // Subtitle + filters
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    let sub = m.subtitle || "";
    if (fParts.length) sub += (sub ? "   ·   " : "") + fParts.join("   ·   ");
    doc.text(sub, 36, 55);
    // Generated date (right)
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${today}   Page ${pg} of ${total}`, pW - 36, 55, { align: "right" });
    // Thin separator
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5);
    doc.line(0, 64, pW, 64);
  }

  // ── draw footer ──
  function drawFooter(pg, total) {
    const y = pH - 18;
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4);
    doc.line(36, y - 7, pW - 36, y - 7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text("Financee  —  Confidential", 36, y + 2);
    doc.text(`Page ${pg} of ${total}`, pW - 36, y + 2, { align: "right" });
  }

  doc.autoTable({
    head:   [colHeaders],
    body:   rowData,
    startY: 72,
    margin: { left: 36, right: 36, top: 72, bottom: 32 },
    theme:  "grid",
    headStyles: {
      fillColor: [30, 58, 128], textColor: [255, 255, 255],
      fontStyle: "bold", fontSize: 8, cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 8, textColor: [30, 41, 59], cellPadding: 5,
      lineColor: [226, 232, 240],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: (d) => drawHeader(d.pageNumber, "…"),   // placeholder
  });

  // Redraw header/footer on every page with correct page count
  const totalPg = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPg; i++) {
    doc.setPage(i);
    drawHeader(i, totalPg);
    drawFooter(i, totalPg);
  }

  doc.save(`${m.title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
});

// ═══════════════════════════════════════════
// CSV  —  visible rows + metadata header
// ═══════════════════════════════════════════
$(document).on("click", "#download_csv", function () {
  const tbl = document.getElementById("reportTable");
  if (!tbl) { Swal.fire("No Data", "No data to export.", "warning"); return; }

  const allTh    = [...tbl.querySelectorAll("thead th")];
  const skipCols = allTh.reduce((a, th, i) => { if (th.dataset.noExport === "1") a.push(i); return a; }, []);
  const m        = _rMeta;
  const rows     = [];

  // Meta header
  rows.push([`${m.title} Report`]);
  Object.entries(m.filters || {}).forEach(([k, v]) => rows.push([`${k}: ${v}`]));
  rows.push([`Generated: ${new Date().toLocaleString()}`]);
  rows.push([]);

  // Column headers
  rows.push(allTh.filter((_, i) => !skipCols.includes(i)).map(th => th.textContent.trim()));

  // Data rows — visible only
  tbl.querySelectorAll("tbody tr:not(.filtered-out)").forEach(tr => {
    const row = [];
    tr.querySelectorAll("td").forEach((td, i) => {
      if (skipCols.includes(i)) return;
      let v = td.textContent.trim();
      if (/[,"\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
      row.push(v);
    });
    if (row.length && !row[0].includes("No records")) rows.push(row);
  });

  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${m.title.replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.csv`,
    style: "display:none",
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

// ═══════════════════════════════════════════
// AUTOCOMPLETE
// ═══════════════════════════════════════════
function initAutocomplete() {
  const $inp  = $("#search_name");
  const $box  = $("#suggestions");
  const url   = $inp.data("autocomplete-url");
  let idx = -1, items = [];

  $inp.on("input", function () {
    idx = -1;
    const q = $(this).val();
    if (!q) { $box.hide(); return; }

    $.ajax({ url, data: { term: q }, dataType: "json",
      success(data) {
        $box.empty(); items = data;
        if (!data.length) { $box.hide(); return; }
        data.forEach((p, i) =>
          $("<div>").addClass("suggestion-item").text(p)
            .on("mouseenter", () => { $(".suggestion-item").removeClass("highlight"); $box.children().eq(i).addClass("highlight"); idx = i; })
            .on("click",      () => { $inp.val(p); $box.hide(); })
            .appendTo($box)
        );
        $box.show();
      },
      error(_, s, e) { console.error("Autocomplete:", s, e); }
    });
  });

  $inp.on("keydown", function (e) {
    const $it = $box.children(".suggestion-item");
    if      (e.key === "ArrowDown")  { e.preventDefault(); idx = (idx + 1) % $it.length; }
    else if (e.key === "ArrowUp")    { e.preventDefault(); idx = (idx - 1 + $it.length) % $it.length; }
    else if (e.key === "Escape")     { $box.hide(); return; }
    else if (e.key === "Enter") {
      if (items.length === 1) { $inp.val(items[0]); $box.hide(); }
      else if (idx >= 0)      { $inp.val($it.eq(idx).text()); $box.hide(); }
      return;
    } else return;
    $it.removeClass("highlight").eq(idx).addClass("highlight");
  });

  $(document).on("click.acl", e => {
    if (!$(e.target).closest("#search_name,#suggestions").length) $box.hide();
  });
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
$(document).ready(() => selectReport("cash-ledger"));
