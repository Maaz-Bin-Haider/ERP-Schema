// ============================================================
// Month-End Close — section script
// Records each month's earned profit (Sales − COGS − Expenses)
// into Retained Earnings, and keeps a month-by-month log.
// Withdrawals are done from the Owner Equity page.
// ============================================================

const MC_API = {
  overview: "/month-close/api/overview/",
  preview:  "/month-close/api/preview/",
  close:    "/month-close/api/close/",
  reverse:  "/month-close/api/reverse/",
};

function mcCsrf() {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
}

let _mcClosed = [];
let _mcTotals = { total_closed_profit: 0, retained_earnings_balance: 0 };

function mcFmt(n) {
  return (parseFloat(n) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// year + month (1-12) -> "June 2026"
function mcMonthName(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (isNaN(d)) return `${month}/${year}`;
  return d.toLocaleString("en-PK", { month: "long", year: "numeric" });
}

function mcDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? String(ts).slice(0, 10) : d.toLocaleDateString("en-PK");
}

function mcProfitCell(value) {
  const v = parseFloat(value) || 0;
  const cls = v < 0 ? "mc-amt-neg" : "mc-amt-pos";
  const sign = v < 0 ? "−" : "";
  return `<span class="mc-amt ${cls}">${sign}${mcFmt(Math.abs(v))}</span>`;
}

async function mcLoadOverview() {
  try {
    const r = await fetch(MC_API.overview, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!r.ok) return;
    const d = await r.json();

    _mcTotals = {
      total_closed_profit: d.total_closed_profit || 0,
      retained_earnings_balance: d.retained_earnings_balance || 0,
    };
    _mcClosed = d.closed || [];

    document.getElementById("mc-total").textContent = mcFmt(d.total_closed_profit);
    document.getElementById("mc-re").textContent    = mcFmt(d.retained_earnings_balance);

    // ----- open months -----
    const openTb = document.getElementById("mc-open-tbody");
    const open = d.open || [];
    if (!open.length) {
      openTb.innerHTML = `<tr><td colspan="3" class="mc-empty">Nothing to close — all months with activity are closed</td></tr>`;
    } else {
      openTb.innerHTML = open.map((m) => `
        <tr>
          <td>${mcMonthName(m.year, m.month)}</td>
          <td class="mc-num">${mcProfitCell(m.profit)}</td>
          <td style="text-align:right;">
            <button class="mc-close-btn" onclick="mcClose(${m.year}, ${m.month})">
              <i class="fa-solid fa-lock"></i> Close
            </button>
          </td>
        </tr>`).join("");
    }

    // ----- closed months -----
    const closedTb = document.getElementById("mc-closed-tbody");
    if (!_mcClosed.length) {
      closedTb.innerHTML = `<tr><td colspan="7" class="mc-empty">No months closed yet</td></tr>`;
    } else {
      closedTb.innerHTML = _mcClosed.map((m) => `
        <tr>
          <td>${mcMonthName(m.year, m.month)}</td>
          <td class="mc-num">${mcFmt(m.sales)}</td>
          <td class="mc-num">${mcFmt(m.cogs)}</td>
          <td class="mc-num">${mcFmt(m.expenses)}</td>
          <td class="mc-num">${mcProfitCell(m.profit)}</td>
          <td>${mcDate(m.closed_at)}</td>
          <td style="text-align:right;">
            <button class="mc-reverse" title="Reverse this close" onclick="mcReverse(${m.year}, ${m.month})">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          </td>
        </tr>`).join("");
    }
  } catch (e) { /* ignore */ }
}

async function mcClose(year, month) {
  const label = mcMonthName(year, month);
  const ok = await Swal.fire({
    title: `Close ${label}?`,
    html: `This posts a closing entry moving that month's earned profit into <b>Retained Earnings</b>. ` +
          `No cash is moved and your Net Position is unchanged. You can reverse it later.`,
    icon: "question", showCancelButton: true, confirmButtonText: "Close month",
    confirmButtonColor: "#2563eb",
  });
  if (!ok.isConfirmed) return;
  try {
    const r = await fetch(MC_API.close, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": mcCsrf() },
      body: JSON.stringify({ year, month }),
    });
    const d = await r.json();
    if (!r.ok || d.status !== "success") {
      Swal.fire("Error", d.message || "Could not close the month.", "error");
    } else {
      const p = d.result || {};
      await mcLoadOverview();
      Swal.fire({
        icon: "success",
        title: `${label} closed`,
        text: `Profit recognised: ${mcFmt(p.profit)}`,
        timer: 1600, showConfirmButton: false,
      });
    }
  } catch (e) {
    Swal.fire("Error", "Request failed. " + e.message, "error");
  }
}

async function mcReverse(year, month) {
  const label = mcMonthName(year, month);
  const ok = await Swal.fire({
    title: `Reverse close for ${label}?`,
    text: "The closing entry will be removed and the month re-opened. Retained Earnings is restored.",
    icon: "warning", showCancelButton: true, confirmButtonText: "Reverse",
    confirmButtonColor: "#dc2626",
  });
  if (!ok.isConfirmed) return;
  try {
    const r = await fetch(MC_API.reverse, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": mcCsrf() },
      body: JSON.stringify({ year, month }),
    });
    const d = await r.json();
    if (!r.ok || d.status !== "success") {
      Swal.fire("Error", d.message || "Could not reverse the close.", "error");
    } else {
      await mcLoadOverview();
      Swal.fire({ icon: "success", title: "Re-opened", timer: 1100, showConfirmButton: false });
    }
  } catch (e) {
    Swal.fire("Error", "Request failed. " + e.message, "error");
  }
}

/* ─────────────────────────── Export: PDF / CSV ─────────────────────────── */
function mcExportPDF() {
  if (!_mcClosed.length) { Swal.fire("Nothing to export", "No months have been closed yet.", "info"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(15); doc.text("Month-End Close — Profit Log", 14, 18);
  doc.setFontSize(10);
  doc.text("Generated " + new Date().toLocaleDateString("en-PK"), 14, 25);

  doc.autoTable({
    startY: 32,
    head: [["Month", "Sales", "COGS", "Expenses", "Profit", "Closed on"]],
    body: _mcClosed.map((m) => [
      mcMonthName(m.year, m.month),
      mcFmt(m.sales),
      mcFmt(m.cogs),
      mcFmt(m.expenses),
      (parseFloat(m.profit) < 0 ? "-" : "") + mcFmt(Math.abs(parseFloat(m.profit) || 0)),
      mcDate(m.closed_at),
    ]),
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    body: [
      ["Total profit recognised", mcFmt(_mcTotals.total_closed_profit)],
      ["Retained Earnings balance", mcFmt(_mcTotals.retained_earnings_balance)],
    ],
    theme: "plain",
    styles: { fontStyle: "bold" },
  });

  doc.save("month_end_close_" + new Date().toISOString().slice(0, 10) + ".pdf");
}

function mcExportCSV() {
  if (!_mcClosed.length) { Swal.fire("Nothing to export", "No months have been closed yet.", "info"); return; }
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const rows = [["Month", "Sales", "COGS", "Expenses", "Profit", "Closed on"].map(esc)];
  _mcClosed.forEach((m) => {
    rows.push([
      mcMonthName(m.year, m.month),
      m.sales, m.cogs, m.expenses, m.profit, mcDate(m.closed_at),
    ].map(esc));
  });
  rows.push([]);
  rows.push(["Total profit recognised", _mcTotals.total_closed_profit].map(esc));
  rows.push(["Retained Earnings balance", _mcTotals.retained_earnings_balance].map(esc));

  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "month_end_close_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mc-download-pdf")?.addEventListener("click", mcExportPDF);
  document.getElementById("mc-download-csv")?.addEventListener("click", mcExportCSV);
  mcLoadOverview();
});
