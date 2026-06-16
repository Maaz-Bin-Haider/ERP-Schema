// ============================================================
// Sales Reports — one pipeline for all reports
// (fetch -> render table/cards/chart -> sort -> export)
// ============================================================

const SR_BASE = "/sales-reports/";

/* ---------- formatting ---------- */
const money = (n) => (parseFloat(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intf  = (n) => (parseInt(n) || 0).toLocaleString("en-PK");
const pctf  = (n) => (n === null || n === undefined ? "—" : (parseFloat(n) || 0).toFixed(2) + "%");
const profitClass = (n) => (parseFloat(n) < 0 ? "sr-neg" : "sr-pos");

/* ---------- report definitions ---------- */
const REPORTS = {
  summary: {
    endpoint: "api/summary/", title: "Sales Summary",
    sub: "Net totals for the selected period (returned serials excluded)", kind: "summary",
  },
  product_profitability: {
    endpoint: "api/product-profitability/", title: "Product Profitability",
    sub: "Revenue, cost, profit & margin by product", kind: "table",
    columns: [
      { k: "item_name", label: "Product" }, { k: "brand", label: "Brand" },
      { k: "units", label: "Units", t: "int" }, { k: "revenue", label: "Revenue", t: "money" },
      { k: "cost", label: "Cost", t: "money" }, { k: "profit", label: "Profit", t: "profit" },
      { k: "margin_pct", label: "Margin", t: "pct" },
    ],
    totals: ["units", "revenue", "cost", "profit"],
    chart: { kind: "bar", labelKey: "item_name", valueKey: "profit", topN: 10, label: "Profit — top 10 products" },
  },
  customer_profitability: {
    endpoint: "api/customer-profitability/", title: "Customer Profitability",
    sub: "Revenue, cost, profit & margin by customer", kind: "table",
    columns: [
      { k: "customer_name", label: "Customer" }, { k: "invoices", label: "Invoices", t: "int" },
      { k: "units", label: "Units", t: "int" }, { k: "revenue", label: "Revenue", t: "money" },
      { k: "cost", label: "Cost", t: "money" }, { k: "profit", label: "Profit", t: "profit" },
      { k: "margin_pct", label: "Margin", t: "pct" },
    ],
    totals: ["invoices", "units", "revenue", "cost", "profit"],
    chart: { kind: "bar", labelKey: "customer_name", valueKey: "profit", topN: 10, label: "Profit — top 10 customers" },
  },
  sales_by_product: {
    endpoint: "api/sales-by-product/", title: "Sales by Product",
    sub: "Units sold & revenue share by product", kind: "table",
    columns: [
      { k: "item_name", label: "Product" }, { k: "brand", label: "Brand" },
      { k: "units", label: "Units", t: "int" }, { k: "revenue", label: "Revenue", t: "money" },
      { k: "pct_of_total", label: "% of sales", t: "pct" },
    ],
    totals: ["units", "revenue"],
    chart: { kind: "bar", labelKey: "item_name", valueKey: "revenue", topN: 10, label: "Revenue — top 10 products" },
  },
  sales_by_customer: {
    endpoint: "api/sales-by-customer/", title: "Sales by Customer",
    sub: "Invoices, units & revenue share by customer", kind: "table",
    columns: [
      { k: "customer_name", label: "Customer" }, { k: "invoices", label: "Invoices", t: "int" },
      { k: "units", label: "Units", t: "int" }, { k: "revenue", label: "Revenue", t: "money" },
      { k: "pct_of_total", label: "% of sales", t: "pct" },
    ],
    totals: ["invoices", "units", "revenue"],
    chart: { kind: "bar", labelKey: "customer_name", valueKey: "revenue", topN: 10, label: "Revenue — top 10 customers" },
  },
  sale_wise: {
    endpoint: "api/sale-wise/", title: "Sale-wise Profit",
    sub: "Per-serial profit (returned serials excluded)", kind: "table",
    columns: [
      { k: "sale_date", label: "Date" }, { k: "item_name", label: "Product" },
      { k: "serial_number", label: "Serial" }, { k: "customer_name", label: "Customer" },
      { k: "sale_price", label: "Sale", t: "money" }, { k: "purchase_price", label: "Cost", t: "money" },
      { k: "profit_loss", label: "Profit", t: "profit" }, { k: "profit_loss_percent", label: "P %", t: "pct" },
      { k: "vendor_name", label: "Vendor" },
    ],
    totals: ["sale_price", "purchase_price", "profit_loss"],
    chart: null,
  },
  trend: {
    endpoint: "api/trend/", title: "Sales Trend Dashboard",
    sub: "Revenue & profit over time", kind: "trend", granularity: true,
    columns: [
      { k: "period", label: "Period" }, { k: "invoices", label: "Invoices", t: "int" },
      { k: "units", label: "Units", t: "int" }, { k: "revenue", label: "Revenue", t: "money" },
      { k: "profit", label: "Profit", t: "profit" },
    ],
    totals: ["invoices", "units", "revenue", "profit"],
  },
  invoice_register: {
    endpoint: "api/invoice-register/", title: "Invoice Register",
    sub: "Sales invoices issued in the period (gross, as invoiced)", kind: "table",
    columns: [
      { k: "sales_invoice_id", label: "Invoice #" }, { k: "invoice_date", label: "Date" },
      { k: "customer_name", label: "Customer" }, { k: "items", label: "Items", t: "int" },
      { k: "units", label: "Units", t: "int" }, { k: "total_amount", label: "Amount", t: "money" },
    ],
    totals: ["total_amount"],
  },
};

/* ---------- state ---------- */
let SR = { key: null, rows: [], totals: {}, columns: [], chart: null, sort: { col: null, dir: 1 } };

/* ---------- date helpers ---------- */
function iso(d) { return d.toISOString().slice(0, 10); }
function setRange(which) {
  const now = new Date();
  let from, to;
  if (which === "this_month") { from = new Date(now.getFullYear(), now.getMonth(), 1); to = now; }
  else if (which === "last_month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (which === "this_year") { from = new Date(now.getFullYear(), 0, 1); to = now; }
  document.getElementById("sr-from").value = iso(from);
  document.getElementById("sr-to").value = iso(to);
  document.querySelectorAll("#sr-quick .sr-chip").forEach((c) => c.classList.toggle("active", c.dataset.range === which));
}

/* ---------- report selection ---------- */
function selectReport(key) {
  SR.key = key; SR.sort = { col: null, dir: 1 };
  const cfg = REPORTS[key];
  document.querySelectorAll("#sr-report-buttons .report-btn").forEach((b) => b.classList.toggle("active", b.dataset.report === key));
  document.getElementById("sr-report-title").textContent = cfg.title;
  document.getElementById("sr-report-sub").textContent = cfg.sub;
  document.getElementById("sr-form").style.display = "flex";
  document.getElementById("sr-gran-field").style.display = cfg.granularity ? "flex" : "none";
  document.getElementById("sr-placeholder").style.display = "block";
  document.getElementById("sr-placeholder").querySelector("p").textContent = "Choose a date range and hit Generate.";
  ["sr-stats", "sr-chart-wrap", "sr-actions", "sr-table-wrap"].forEach((id) => (document.getElementById(id).style.display = "none"));
  destroyChart();
}

/* ---------- fetch + render ---------- */
async function generate() {
  if (!SR.key) return;
  const cfg = REPORTS[SR.key];
  const from = document.getElementById("sr-from").value;
  const to = document.getElementById("sr-to").value;
  if (!from || !to) { Swal.fire("Pick dates", "Please choose a from and to date.", "warning"); return; }
  if (from > to) { Swal.fire("Check dates", "‘From’ is after ‘To’.", "warning"); return; }

  let url = SR_BASE + cfg.endpoint + `?from=${from}&to=${to}`;
  if (cfg.granularity) url += `&granularity=${document.getElementById("sr-gran").value}`;

  document.getElementById("sr-placeholder").style.display = "block";
  document.getElementById("sr-placeholder").innerHTML = `<div class="sr-loading"><span class="sr-spin"></span>Crunching numbers…</div>`;

  try {
    const r = await fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    const d = await r.json();
    if (!r.ok) { showError(d.error || "Could not load the report."); return; }
    document.getElementById("sr-placeholder").style.display = "none";
    if (cfg.kind === "summary") renderSummary(d);
    else if (cfg.kind === "trend") renderTrend(cfg, d);
    else renderTable(cfg, d);
  } catch (e) {
    showError("Request failed. " + e.message);
  }
}

function showError(msg) {
  const ph = document.getElementById("sr-placeholder");
  ph.style.display = "block";
  ph.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><p>${msg}</p>`;
}

/* ---------- SUMMARY ---------- */
function renderSummary(d) {
  destroyChart();
  const cards = [
    { label: "Net Sales", val: money(d.net_sales), cls: "" },
    { label: "Cost of Sales", val: money(d.total_cost), cls: "" },
    { label: "Gross Profit", val: money(d.gross_profit), cls: profitClass(d.gross_profit), accent: true },
    { label: "Margin", val: pctf(d.margin_pct), cls: "" },
    { label: "Invoices", val: intf(d.invoice_count), cls: "" },
    { label: "Units Sold", val: intf(d.units_sold), cls: "" },
    { label: "Avg Invoice", val: money(d.avg_invoice), cls: "" },
    { label: "Returns (in period)", val: intf(d.returns_count) + " · " + money(d.returns_value), cls: "" },
  ];
  const stats = document.getElementById("sr-stats");
  stats.innerHTML = cards.map((c) =>
    `<div class="sr-stat ${c.accent ? "sr-stat-accent" : ""}">
       <span class="sr-stat-label">${c.label}</span>
       <span class="sr-stat-value ${c.cls}">${c.val}</span>
     </div>`).join("");
  stats.style.display = "grid";

  // doughnut: cost vs profit composition of revenue
  document.getElementById("sr-chart-wrap").style.display = "block";
  const ctx = document.getElementById("sr-chart");
  SR.chart = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ["Cost of Sales", "Gross Profit"],
      datasets: [{ data: [Math.max(d.total_cost, 0), Math.max(d.gross_profit, 0)], backgroundColor: ["#cbd5e1", "#2563eb"], borderWidth: 0 }] },
    options: { responsive: true, animation: { animateRotate: true, duration: 700 },
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Revenue composition" } } },
  });
  // summary has no table
  ["sr-actions", "sr-table-wrap"].forEach((id) => (document.getElementById(id).style.display = "none"));
  SR.rows = [ ["Net Sales", d.net_sales], ["Cost of Sales", d.total_cost], ["Gross Profit", d.gross_profit],
    ["Margin %", d.margin_pct], ["Invoices", d.invoice_count], ["Units Sold", d.units_sold],
    ["Avg Invoice", d.avg_invoice], ["Returns count", d.returns_count], ["Returns value", d.returns_value] ];
  SR.columns = [{ k: 0, label: "Metric" }, { k: 1, label: "Value" }];
  document.getElementById("sr-actions").style.display = "flex";
}

/* ---------- TABLE reports ---------- */
function renderTable(cfg, d) {
  SR.rows = d.rows || [];
  SR.totals = d.totals || {};
  SR.columns = cfg.columns;
  drawTable(cfg);
  drawBarChart(cfg);
  document.getElementById("sr-actions").style.display = "flex";
}

function drawTable(cfg) {
  const thead = document.getElementById("sr-thead");
  const tbody = document.getElementById("sr-tbody");
  const tfoot = document.getElementById("sr-tfoot");

  thead.innerHTML = "<tr>" + cfg.columns.map((c, i) => {
    const numeric = ["int", "money", "pct", "profit"].includes(c.t);
    const arrow = SR.sort.col === i ? (SR.sort.dir > 0 ? " ▲" : " ▼") : "";
    return `<th class="${numeric ? "sr-num" : ""}" data-col="${i}">${c.label}${arrow}</th>`;
  }).join("") + "</tr>";

  let rows = SR.rows.slice();
  if (SR.sort.col !== null) {
    const ck = cfg.columns[SR.sort.col].k, num = ["int", "money", "pct", "profit"].includes(cfg.columns[SR.sort.col].t);
    rows.sort((a, b) => {
      let x = a[ck], y = b[ck];
      if (num) { x = parseFloat(x) || 0; y = parseFloat(y) || 0; return (x - y) * SR.sort.dir; }
      return String(x).localeCompare(String(y)) * SR.sort.dir;
    });
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="sr-empty" colspan="${cfg.columns.length}">No data for this period</td></tr>`;
    tfoot.innerHTML = ""; 
  } else {
    tbody.innerHTML = rows.map((row) => "<tr>" + cfg.columns.map((c) => fmtCell(c, row[c.k])).join("") + "</tr>").join("");
    tfoot.innerHTML = cfg.totals ? "<tr>" + cfg.columns.map((c, i) => {
      if (i === 0) return `<td>Total</td>`;
      if (cfg.totals.includes(c.k)) {
        const v = SR.totals[c.k];
        const cls = c.t === "profit" ? profitClass(v) : "";
        return `<td class="sr-num ${cls}">${c.t === "int" ? intf(v) : money(v)}</td>`;
      }
      return `<td></td>`;
    }).join("") + "</tr>" : "";
  }
  document.getElementById("sr-table-wrap").style.display = "block";

  thead.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
    const c = parseInt(th.dataset.col);
    if (SR.sort.col === c) SR.sort.dir *= -1; else { SR.sort.col = c; SR.sort.dir = 1; }
    drawTable(cfg);
  }));
}

function fmtCell(c, v) {
  if (c.t === "money") return `<td class="sr-num">${money(v)}</td>`;
  if (c.t === "int") return `<td class="sr-num">${intf(v)}</td>`;
  if (c.t === "pct") return `<td class="sr-num">${pctf(v)}</td>`;
  if (c.t === "profit") return `<td class="sr-num ${profitClass(v)}">${money(v)}</td>`;
  return `<td>${v === null || v === undefined || v === "" ? "—" : v}</td>`;
}

/* ---------- charts ---------- */
function destroyChart() { if (SR.chart) { SR.chart.destroy(); SR.chart = null; } document.getElementById("sr-chart-wrap").style.display = "none"; }

function drawBarChart(cfg) {
  destroyChart();
  if (!cfg.chart || !SR.rows.length) return;
  const top = SR.rows.slice().sort((a, b) => (parseFloat(b[cfg.chart.valueKey]) || 0) - (parseFloat(a[cfg.chart.valueKey]) || 0)).slice(0, cfg.chart.topN);
  const labels = top.map((r) => r[cfg.chart.labelKey] || "—");
  const data = top.map((r) => parseFloat(r[cfg.chart.valueKey]) || 0);
  document.getElementById("sr-chart-wrap").style.display = "block";
  SR.chart = new Chart(document.getElementById("sr-chart"), {
    type: "bar",
    data: { labels, datasets: [{ label: cfg.chart.label, data, backgroundColor: "#2563eb", borderRadius: 4 }] },
    options: { indexAxis: "y", responsive: true, animation: { duration: 700 },
      plugins: { legend: { display: false }, title: { display: true, text: cfg.chart.label } },
      scales: { x: { ticks: { callback: (v) => Number(v).toLocaleString("en-PK") } } } },
  });
}

/* ---------- TREND ---------- */
function renderTrend(cfg, d) {
  SR.rows = d.rows || [];
  SR.totals = (d.rows || []).reduce((a, r) => ({
    invoices: (a.invoices || 0) + (+r.invoices || 0), units: (a.units || 0) + (+r.units || 0),
    revenue: (a.revenue || 0) + (+r.revenue || 0), profit: (a.profit || 0) + (+r.profit || 0),
  }), {});
  SR.columns = cfg.columns;

  destroyChart();
  document.getElementById("sr-chart-wrap").style.display = "block";
  const labels = SR.rows.map((r) => r.period);
  SR.chart = new Chart(document.getElementById("sr-chart"), {
    type: "line",
    data: { labels, datasets: [
      { label: "Revenue", data: SR.rows.map((r) => +r.revenue), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.08)", fill: true, tension: 0.3, yAxisID: "y" },
      { label: "Profit", data: SR.rows.map((r) => +r.profit), borderColor: "#15803d", backgroundColor: "rgba(21,128,61,0.06)", fill: true, tension: 0.3, yAxisID: "y" },
    ] },
    options: { responsive: true, animation: { duration: 800 }, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Revenue & profit trend" } },
      scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString("en-PK") } } } },
  });

  drawTable(cfg);
  document.getElementById("sr-actions").style.display = "flex";
}

/* ---------- export ---------- */
function exportPDF() {
  if (!SR.rows.length) { Swal.fire("Nothing to export", "Generate a report first.", "info"); return; }
  const cfg = REPORTS[SR.key];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: SR.columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14); doc.text(cfg.title, 14, 16);
  doc.setFontSize(9);
  const from = document.getElementById("sr-from").value, to = document.getElementById("sr-to").value;
  doc.text(`${from} to ${to}  ·  generated ${new Date().toLocaleDateString("en-PK")}`, 14, 22);

  const head = [SR.columns.map((c) => c.label)];
  const body = SR.rows.map((row) => SR.columns.map((c) => exportVal(c, row[c.k])));
  const foot = (cfg.totals) ? [SR.columns.map((c, i) => i === 0 ? "Total" : (cfg.totals.includes(c.k) ? (c.t === "int" ? intf(SR.totals[c.k]) : money(SR.totals[c.k])) : ""))] : [];
  doc.autoTable({ startY: 27, head, body, foot, theme: "grid", headStyles: { fillColor: [37, 99, 235] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" }, styles: { fontSize: 7.5 } });
  doc.save(cfg.title.replace(/\s+/g, "_").toLowerCase() + "_" + from + "_" + to + ".pdf");
}

function exportCSV() {
  if (!SR.rows.length) { Swal.fire("Nothing to export", "Generate a report first.", "info"); return; }
  const cfg = REPORTS[SR.key];
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [SR.columns.map((c) => esc(c.label)).join(",")];
  SR.rows.forEach((row) => lines.push(SR.columns.map((c) => esc(exportRaw(c, row[c.k]))).join(",")));
  if (cfg.totals) lines.push(SR.columns.map((c, i) => esc(i === 0 ? "Total" : (cfg.totals.includes(c.k) ? SR.totals[c.k] : ""))).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  const from = document.getElementById("sr-from").value, to = document.getElementById("sr-to").value;
  a.href = URL.createObjectURL(blob);
  a.download = cfg.title.replace(/\s+/g, "_").toLowerCase() + "_" + from + "_" + to + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

function exportVal(c, v) { // for PDF (formatted)
  if (c.t === "money" || c.t === "profit") return money(v);
  if (c.t === "int") return intf(v);
  if (c.t === "pct") return pctf(v);
  return v === null || v === undefined ? "" : String(v);
}
function exportRaw(c, v) { // for CSV (raw numbers)
  if (["money", "profit", "int", "pct"].includes(c.t)) return v ?? "";
  return v ?? "";
}

/* ---------- init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  setRange("this_month");
  document.querySelectorAll("#sr-quick .sr-chip").forEach((chip) =>
    chip.addEventListener("click", () => setRange(chip.dataset.range)));
  document.getElementById("sr-generate").addEventListener("click", generate);
  document.getElementById("sr-pdf").addEventListener("click", exportPDF);
  document.getElementById("sr-csv").addEventListener("click", exportCSV);
  document.querySelectorAll("#sr-report-buttons .report-btn").forEach((b) =>
    b.addEventListener("click", () => selectReport(b.dataset.report)));

  // auto-select the first available report
  const first = document.querySelector("#sr-report-buttons .report-btn");
  if (first) selectReport(first.dataset.report);
});
