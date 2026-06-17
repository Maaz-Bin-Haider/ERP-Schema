// // // ============================================================
// // //  detailed_ledger2.js  –  Professional Party Ledger Renderer
// // // ============================================================

// // /* ── colour / label maps ─────────────────────────────────── */
// // const TXN_META = {
// //   "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"          },
// //   "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"      },
// //   "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"       },
// //   "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"       },
// //   "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"   },
// //   "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return" },
// // };

// // function getTxnMeta(type) {
// //   return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
// // }

// // /* ── number formatter ────────────────────────────────────── */
// // function fmt(n) {
// //   if (n === null || n === undefined || n === "") return "—";
// //   const num = parseFloat(n);
// //   if (isNaN(num)) return "—";
// //   return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// // }

// // /* ── CSRF ────────────────────────────────────────────────── */
// // function getCSRFToken() {
// //   const name = "csrftoken=";
// //   for (let c of decodeURIComponent(document.cookie).split(";")) {
// //     c = c.trim();
// //     if (c.startsWith(name)) return c.slice(name.length);
// //   }
// //   return "";
// // }

// // /* ── Invoice-detail panel builder ───────────────────────── */
// // function buildInvoicePanel(d) {
// //   if (!d) return `<span class="no-detail">No invoice details</span>`;

// //   const type = d.type || "";
// //   const meta = getTxnMeta(type);

// //   /* ── helper: serial chips ── */
// //   function serialChips(serials) {
// //     if (!serials || !serials.length) return "";
// //     return serials.map(s => {
// //       const comment = s.comment ? `<span class="serial-comment">${escHtml(s.comment)}</span>` : "";
// //       const price   = s.sold_price != null
// //         ? `<span class="serial-price">@ ${fmt(s.sold_price)}</span>` : "";
// //       return `<span class="serial-chip">${escHtml(s.serial)}${price}${comment}</span>`;
// //     }).join("");
// //   }

// //   /* ── helper: item rows ── */
// //   function itemRows(items) {
// //     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
// //     return `
// //       <table class="detail-item-table">
// //         <thead>
// //           <tr>
// //             <th>Item</th>
// //             <th class="text-right">Qty</th>
// //             <th class="text-right">Unit Price</th>
// //             <th class="text-right">Line Total</th>
// //           </tr>
// //         </thead>
// //         <tbody>
// //           ${items.map(it => `
// //             <tr>
// //               <td>
// //                 <div class="item-name-cell">${escHtml(it.item_name || "")}</div>
// //                 <div class="serial-chips">${serialChips(it.serials)}</div>
// //               </td>
// //               <td class="text-right">${it.qty ?? "—"}</td>
// //               <td class="text-right">${fmt(it.unit_price)}</td>
// //               <td class="text-right fw-bold">${fmt(it.line_total)}</td>
// //             </tr>
// //           `).join("")}
// //         </tbody>
// //       </table>`;
// //   }

// //   /* ── helper: purchase-return item rows ── */
// //   function prItemRows(items) {
// //     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
// //     return `
// //       <table class="detail-item-table">
// //         <thead>
// //           <tr><th>Item</th><th>Serial</th><th class="text-right">Unit Price</th></tr>
// //         </thead>
// //         <tbody>
// //           ${items.map(it => `
// //             <tr>
// //               <td>${escHtml(it.item_name || "")}</td>
// //               <td><span class="serial-chip">${escHtml(it.serial_number || "")}</span></td>
// //               <td class="text-right">${fmt(it.unit_price)}</td>
// //             </tr>
// //           `).join("")}
// //         </tbody>
// //       </table>`;
// //   }

// //   /* ── helper: sale-return item rows ── */
// //   function srItemRows(items) {
// //     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
// //     return `
// //       <table class="detail-item-table">
// //         <thead>
// //           <tr><th>Item</th><th>Serial</th><th class="text-right">Sold Price</th><th class="text-right">Cost Price</th></tr>
// //         </thead>
// //         <tbody>
// //           ${items.map(it => `
// //             <tr>
// //               <td>${escHtml(it.item_name || "")}</td>
// //               <td><span class="serial-chip">${escHtml(it.serial_number || "")}</span></td>
// //               <td class="text-right">${fmt(it.sold_price)}</td>
// //               <td class="text-right">${fmt(it.cost_price)}</td>
// //             </tr>
// //           `).join("")}
// //         </tbody>
// //       </table>`;
// //   }

// //   /* ── build per-type ── */
// //   let header = "", body = "";

// //   if (type === "Sale Invoice") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Sale Invoice #${d.sales_invoice_id}</span>
// //         <span class="dp-party">${escHtml(d.customer || "")}</span>
// //         <span class="dp-date">${d.invoice_date || ""}</span>
// //         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
// //       </div>`;
// //     body = itemRows(d.items);

// //   } else if (type === "Purchase Invoice") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Purchase Invoice #${d.purchase_invoice_id}</span>
// //         <span class="dp-party">${escHtml(d.vendor || "")}</span>
// //         <span class="dp-date">${d.invoice_date || ""}</span>
// //         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
// //       </div>`;
// //     body = itemRows(d.items);

// //   } else if (type === "Receipt") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Receipt #${d.receipt_id}</span>
// //         <span class="dp-party">${escHtml(d.party || "")}</span>
// //         <span class="dp-date">${d.receipt_date || ""}</span>
// //         <span class="dp-total">Amount: <strong>${fmt(d.amount)}</strong></span>
// //       </div>`;
// //     body = `
// //       <div class="dp-payment-detail">
// //         <div class="dp-row"><span>Method</span><span>${escHtml(d.method || "—")}</span></div>
// //         <div class="dp-row"><span>Reference #</span><span>${escHtml(d.reference_no || "—")}</span></div>
// //         ${d.notes       ? `<div class="dp-row"><span>Notes</span><span>${escHtml(d.notes)}</span></div>` : ""}
// //         ${d.description ? `<div class="dp-row"><span>Description</span><span>${escHtml(d.description)}</span></div>` : ""}
// //       </div>`;

// //   } else if (type === "Payment") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Payment #${d.payment_id}</span>
// //         <span class="dp-party">${escHtml(d.party || "")}</span>
// //         <span class="dp-date">${d.payment_date || ""}</span>
// //         <span class="dp-total">Amount: <strong>${fmt(d.amount)}</strong></span>
// //       </div>`;
// //     body = `
// //       <div class="dp-payment-detail">
// //         <div class="dp-row"><span>Method</span><span>${escHtml(d.method || "—")}</span></div>
// //         <div class="dp-row"><span>Reference #</span><span>${escHtml(d.reference_no || "—")}</span></div>
// //         ${d.notes       ? `<div class="dp-row"><span>Notes</span><span>${escHtml(d.notes)}</span></div>` : ""}
// //         ${d.description ? `<div class="dp-row"><span>Description</span><span>${escHtml(d.description)}</span></div>` : ""}
// //       </div>`;

// //   } else if (type === "Purchase Return") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Purchase Return #${d.purchase_return_id}</span>
// //         <span class="dp-party">${escHtml(d.vendor || "")}</span>
// //         <span class="dp-date">${d.return_date || ""}</span>
// //         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
// //       </div>`;
// //     body = prItemRows(d.items);

// //   } else if (type === "Sale Return") {
// //     header = `
// //       <div class="dp-meta">
// //         <span class="dp-ref">Sale Return #${d.sales_return_id}</span>
// //         <span class="dp-party">${escHtml(d.customer || "")}</span>
// //         <span class="dp-date">${d.return_date || ""}</span>
// //         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
// //       </div>`;
// //     body = srItemRows(d.items);

// //   } else {
// //     header = `<div class="dp-meta"><span class="dp-ref">${escHtml(type)}</span></div>`;
// //     body   = `<pre class="dp-raw">${escHtml(JSON.stringify(d, null, 2))}</pre>`;
// //   }

// //   return `<div class="detail-panel">${header}${body}</div>`;
// // }

// // function escHtml(str) {
// //   if (str === null || str === undefined) return "";
// //   return String(str)
// //     .replace(/&/g, "&amp;")
// //     .replace(/</g, "&lt;")
// //     .replace(/>/g, "&gt;")
// //     .replace(/"/g, "&quot;");
// // }

// // /* ── Main render ─────────────────────────────────────────── */
// // function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
// //   const container = document.getElementById("ledger2-container");
// //   if (!container) return;

// //   if (!rows || rows.length === 0) {
// //     container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
// //     return;
// //   }

// //   /* running totals */
// //   let totalDebit = 0, totalCredit = 0;
// //   rows.forEach(r => {
// //     totalDebit  += parseFloat(r.debit  || 0);
// //     totalCredit += parseFloat(r.credit || 0);
// //   });
// //   const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);

// //   /* group by month for visual separators */
// //   let lastMonth = null;

// //   const rowsHtml = rows.map((r, idx) => {
// //     const d     = r.invoice_details;
// //     const type  = d ? (d.type || "") : "";
// //     const meta  = getTxnMeta(type);
// //     const bal   = parseFloat(r.running_balance || 0);
// //     const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
// //     const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";

// //     /* month separator */
// //     const rowDate  = r.entry_date ? r.entry_date.slice(0, 7) : "";
// //     let separator  = "";
// //     if (rowDate !== lastMonth) {
// //       lastMonth = rowDate;
// //       const monthLabel = r.entry_date
// //         ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
// //         : "";
// //       separator = `<tr class="month-sep-row"><td colspan="9"><span class="month-sep-label">${monthLabel}</span></td></tr>`;
// //     }

// //     const hasDetail = !!d;
// //     const detailId  = `detail-${idx}`;

// //     return `${separator}
// //     <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
// //       <td class="col-date">${r.entry_date || "—"}</td>
// //       <td class="col-jid">${r.journal_id || "—"}</td>
// //       <td class="col-type">
// //         <span class="txn-badge ${meta.badge}">
// //           <span class="txn-icon">${meta.icon}</span>${meta.label}
// //         </span>
// //       </td>
// //       <td class="col-desc">${escHtml(r.description || "")}</td>
// //       <td class="col-debit text-right">${parseFloat(r.debit || 0) > 0 ? fmt(r.debit) : ""}</td>
// //       <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
// //       <td class="col-bal text-right">
// //         <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
// //         ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
// //       </td>
// //       <td class="col-toggle">
// //         ${hasDetail
// //           ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
// //                <span class="expand-icon">▼</span>
// //              </button>`
// //           : ""}
// //       </td>
// //     </tr>
// //     ${hasDetail ? `
// //     <tr class="detail-row" id="${detailId}" style="display:none;">
// //       <td colspan="9" class="detail-cell">
// //         ${buildInvoicePanel(d)}
// //       </td>
// //     </tr>` : ""}`;
// //   }).join("");

// //   const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
// //   const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)" : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";

// //   container.innerHTML = `
// //     <div class="ledger2-header-bar">
// //       <div class="ledger2-party-info">
// //         <span class="ledger2-party-name">${escHtml(partyName)}</span>
// //         <span class="ledger2-period">${fromDate} → ${toDate}</span>
// //       </div>
// //       <div class="ledger2-summary-chips">
// //         <div class="summary-chip chip-debit">
// //           <span class="chip-label">Total Debit</span>
// //           <span class="chip-value">${fmt(totalDebit)}</span>
// //         </div>
// //         <div class="summary-chip chip-credit">
// //           <span class="chip-label">Total Credit</span>
// //           <span class="chip-value">${fmt(totalCredit)}</span>
// //         </div>
// //         <div class="summary-chip chip-balance ${closingClass}">
// //           <span class="chip-label">Closing Balance</span>
// //           <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
// //           <span class="chip-sub">${closingLabel}</span>
// //         </div>
// //       </div>
// //     </div>

// //     <div class="ledger2-table-wrap">
// //       <table class="ledger2-table" id="ledger2Table">
// //         <thead>
// //           <tr>
// //             <th class="col-date">Date</th>
// //             <th class="col-jid">J#</th>
// //             <th class="col-type">Type</th>
// //             <th class="col-desc">Description</th>
// //             <th class="col-debit text-right">Debit</th>
// //             <th class="col-credit text-right">Credit</th>
// //             <th class="col-bal text-right">Balance</th>
// //             <th class="col-toggle"></th>
// //           </tr>
// //         </thead>
// //         <tbody>
// //           ${rowsHtml}
// //         </tbody>
// //         <tfoot>
// //           <tr class="ledger2-foot">
// //             <td colspan="4" class="foot-label">Totals</td>
// //             <td class="text-right foot-total">${fmt(totalDebit)}</td>
// //             <td class="text-right foot-total">${fmt(totalCredit)}</td>
// //             <td colspan="2" class="text-right foot-balance ${closingClass}">
// //               ${fmt(Math.abs(closingBal))}
// //               <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
// //             </td>
// //           </tr>
// //         </tfoot>
// //       </table>
// //     </div>

// //     <div class="ledger2-actions">
// //       <button class="l2-btn l2-btn-pdf" onclick="downloadLedger2PDF()">📄 Download PDF</button>
// //       <button class="l2-btn l2-btn-csv" onclick="downloadLedger2CSV()">📊 Download CSV</button>
// //       <button class="l2-btn l2-btn-expand" onclick="expandAllDetails()">⊞ Expand All</button>
// //       <button class="l2-btn l2-btn-collapse" onclick="collapseAllDetails()">⊟ Collapse All</button>
// //     </div>
// //   `;

// //   /* store for PDF/CSV */
// //   window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
// // }

// // /* ── toggle single row ───────────────────────────────────── */
// // function toggleDetail(id, btn) {
// //   const row = document.getElementById(id);
// //   if (!row) return;
// //   const isHidden = row.style.display === "none";
// //   row.style.display = isHidden ? "table-row" : "none";
// //   const icon = btn.querySelector(".expand-icon");
// //   if (icon) icon.textContent = isHidden ? "▲" : "▼";
// //   btn.classList.toggle("expanded", isHidden);
// // }

// // function expandAllDetails() {
// //   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
// //   document.querySelectorAll(".expand-btn").forEach(b => {
// //     b.classList.add("expanded");
// //     const ic = b.querySelector(".expand-icon");
// //     if (ic) ic.textContent = "▲";
// //   });
// // }

// // function collapseAllDetails() {
// //   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
// //   document.querySelectorAll(".expand-btn").forEach(b => {
// //     b.classList.remove("expanded");
// //     const ic = b.querySelector(".expand-icon");
// //     if (ic) ic.textContent = "▼";
// //   });
// // }

// // /* ── Fetch ───────────────────────────────────────────────── */
// // function fetchDetailedLedger2() {
// //   const partyName = document.getElementById("l2_party_name").value.trim();
// //   const fromDate  = document.getElementById("l2_from_date").value;
// //   const toDate    = document.getElementById("l2_to_date").value;

// //   if (!partyName || !fromDate || !toDate) {
// //     Swal.fire("Missing Fields", "Please fill in all fields.", "warning");
// //     return;
// //   }

// //   Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

// //   fetch("/accountsReports/detailed-ledger2/", {
// //     method: "POST",
// //     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
// //     body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
// //   })
// //     .then(res => res.json())
// //     .then(data => {
// //       Swal.close();
// //       if (data.error) { Swal.fire("Error", data.error, "error"); return; }
// //       renderDetailedLedger2(data, partyName, fromDate, toDate);
// //     })
// //     .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
// // }

// // /* ── PDF download ────────────────────────────────────────── */
// // function downloadLedger2PDF() {
// //   const { jsPDF } = window.jspdf;
// //   const doc = new jsPDF("l", "pt", "a4");  // landscape for more columns
// //   const d   = window._ledger2Data;
// //   if (!d) return;

// //   doc.setFontSize(14);
// //   doc.text(`Party Ledger — ${d.partyName}`, 40, 36);
// //   doc.setFontSize(9);
// //   doc.text(`Period: ${d.fromDate}  to  ${d.toDate}`, 40, 52);
// //   doc.text(`Total Debit: ${fmt(d.totalDebit)}   Total Credit: ${fmt(d.totalCredit)}   Closing Balance: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`, 40, 66);

// //   const tableRows = d.rows.map(r => {
// //     const type = r.invoice_details ? (r.invoice_details.type || "") : "";
// //     const bal  = parseFloat(r.running_balance || 0);
// //     return [
// //       r.entry_date || "",
// //       r.journal_id || "",
// //       type,
// //       r.description || "",
// //       parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
// //       parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
// //       `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
// //     ];
// //   });

// //   doc.autoTable({
// //     head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
// //     body: tableRows,
// //     startY: 82,
// //     theme: "grid",
// //     headStyles: { fillColor: [30, 80, 160], fontSize: 8 },
// //     styles: { fontSize: 7.5 },
// //     columnStyles: {
// //       0: { cellWidth: 65 },
// //       1: { cellWidth: 35 },
// //       2: { cellWidth: 75 },
// //       3: { cellWidth: 200 },
// //       4: { cellWidth: 65, halign: "right" },
// //       5: { cellWidth: 65, halign: "right" },
// //       6: { cellWidth: 70, halign: "right" },
// //     },
// //   });

// //   const total = doc.internal.getNumberOfPages();
// //   for (let i = 1; i <= total; i++) {
// //     doc.setPage(i);
// //     doc.setFontSize(7);
// //     doc.text(`Page ${i} of ${total}`, doc.internal.pageSize.width - 60, doc.internal.pageSize.height - 15);
// //   }

// //   doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}.pdf`);
// // }

// // /* ── CSV download ────────────────────────────────────────── */
// // function downloadLedger2CSV() {
// //   const d = window._ledger2Data;
// //   if (!d) return;

// //   const lines = [
// //     [`Party Ledger`, d.partyName],
// //     [`Period`, `${d.fromDate} to ${d.toDate}`],
// //     [],
// //     ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
// //   ];

// //   d.rows.forEach(r => {
// //     const type = r.invoice_details ? (r.invoice_details.type || "") : "";
// //     const bal  = parseFloat(r.running_balance || 0);
// //     lines.push([
// //       r.entry_date   || "",
// //       r.journal_id   || "",
// //       type,
// //       r.description  || "",
// //       parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
// //       parseFloat(r.credit || 0) > 0 ? r.credit : "",
// //       Math.abs(bal).toFixed(2),
// //       bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
// //     ]);
// //   });

// //   const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
// //   const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
// //   const url  = URL.createObjectURL(blob);
// //   const a    = document.createElement("a");
// //   a.href     = url;
// //   a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
// //   document.body.appendChild(a);
// //   a.click();
// //   document.body.removeChild(a);
// // }

// // /* ── Autocomplete (reuse existing initAutocomplete if available) ── */
// // function initLedger2Autocomplete() {
// //   const $input       = $("#l2_party_name");
// //   const $suggestions = $("#l2_suggestions");
// //   const url          = "/parties/autocomplete-party";
// //   let selectedIndex  = -1, currentSuggestions = [];

// //   $input.on("input", function () {
// //     const q = $(this).val();
// //     selectedIndex = -1;
// //     if (q.length < 1) { $suggestions.hide(); return; }
// //     $.ajax({
// //       url, data: { term: q }, dataType: "json",
// //       success(data) {
// //         $suggestions.empty();
// //         currentSuggestions = data;
// //         if (data.length > 0) {
// //           data.forEach((party, i) => {
// //             $("<div>").addClass("suggestion-item").text(party)
// //               .on("mouseenter", function() {
// //                 $(".suggestion-item").removeClass("highlight");
// //                 $(this).addClass("highlight"); selectedIndex = i;
// //               })
// //               .on("click", function() { $input.val(party); $suggestions.hide(); })
// //               .appendTo($suggestions);
// //           });
// //           $suggestions.show();
// //         } else { $suggestions.hide(); }
// //       },
// //     });
// //   });

// //   $input.on("keydown", function (e) {
// //     const items = $suggestions.children(".suggestion-item");
// //     if (e.key === "ArrowDown") {
// //       e.preventDefault();
// //       selectedIndex = (selectedIndex + 1) % items.length;
// //       items.removeClass("highlight"); $(items[selectedIndex]).addClass("highlight");
// //     } else if (e.key === "ArrowUp") {
// //       e.preventDefault();
// //       selectedIndex = (selectedIndex - 1 + items.length) % items.length;
// //       items.removeClass("highlight"); $(items[selectedIndex]).addClass("highlight");
// //     } else if (e.key === "Enter") {
// //       if (currentSuggestions.length === 1) { $input.val(currentSuggestions[0]); $suggestions.hide(); }
// //       else if (selectedIndex >= 0) { $input.val($(items[selectedIndex]).text()); $suggestions.hide(); }
// //     } else if (e.key === "Escape") { $suggestions.hide(); }
// //   });

// //   $(document).on("click", function (e) {
// //     if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $suggestions.hide();
// //   });
// // }

// // /* ── Mount form into the existing report system ──────────── */
// // function renderLedger2Form() {
// //   const today    = new Date().toISOString().split("T")[0];
// //   const yearStart = `${new Date().getFullYear()}-01-01`;

// //   document.getElementById("ledger2-form-area").innerHTML = `
// //     <div class="l2-form-row">
// //       <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
// //         <label class="l2-label" for="l2_party_name">Party Name</label>
// //         <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…"
// //                autocomplete="off">
// //         <div id="l2_suggestions" class="suggestions-dropdown"></div>
// //       </div>
// //       <div class="l2-field">
// //         <label class="l2-label" for="l2_from_date">From Date</label>
// //         <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
// //       </div>
// //       <div class="l2-field">
// //         <label class="l2-label" for="l2_to_date">To Date</label>
// //         <input type="date" id="l2_to_date" class="l2-input" value="${today}">
// //       </div>
// //       <div class="l2-field l2-field-btn">
// //         <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
// //       </div>
// //     </div>
// //   `;
// //   initLedger2Autocomplete();
// // }

// // /* ── Called from selectReport() in accounts_reports.js ────── */
// // function selectReport(type) {
// //   $(".report-btn").removeClass("active");
// //   const btnMap = {
// //     "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
// //     "receivable": "btn-receivable", "payable": "btn-payable",
// //     "trial": "btn-trial", "ledger2": "btn-ledger2",
// //   };
// //   if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");

// //   /* hide/show sections */
// //   document.getElementById("ledger2-section").style.display  = type === "ledger2" ? "block" : "none";
// //   document.getElementById("classic-section").style.display  = type !== "ledger2" ? "block" : "none";

// //   if (type === "ledger2") {
// //     renderLedger2Form();
// //     document.getElementById("ledger2-container").innerHTML =
// //       `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
// //     return;
// //   }

// //   /* delegate to original handler for other reports */
// //   const $formSection = $("#report-form-container");
// //   $formSection.empty();
// //   $("#reportHeader").html("");
// //   $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);

// //   if      (type === "ledger")      renderLedgerForm();
// //   else if (type === "cash-ledger") renderCashLedgerForm();
// //   else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
// //   else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
// //   else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
// // }

// // $(document).ready(() => selectReport("ledger2"));



// // // ================================================================
// // //  detailed_ledger2.js  –  Professional Party Ledger  (v2)
// // // ================================================================
 
// // /* ── Transaction metadata ─────────────────────────────────── */
// // const TXN_META = {
// //   "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"           },
// //   "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"       },
// //   "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"        },
// //   "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"        },
// //   "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"    },
// //   "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return"  },
// // };
// // function getTxnMeta(type) {
// //   return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
// // }
 
// // /* ── Number formatter ─────────────────────────────────────── */
// // function fmt(n) {
// //   if (n === null || n === undefined || n === "") return "—";
// //   const num = parseFloat(n);
// //   if (isNaN(num)) return "—";
// //   return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// // }
 
// // function escHtml(str) {
// //   if (str === null || str === undefined) return "";
// //   return String(str)
// //     .replace(/&/g, "&amp;").replace(/</g, "&lt;")
// //     .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// // }
 
// // /* ─────────────────────────────────────────────────────────────
// //    CRITICAL FIX: invoice_details can arrive as a JSON string
// //    from Django – always normalise to a plain object.
// // ───────────────────────────────────────────────────────────── */
// // function parseInvoiceDetails(raw) {
// //   if (!raw) return null;
// //   if (typeof raw === "object") return raw;
// //   if (typeof raw === "string") {
// //     try { return JSON.parse(raw); } catch { return null; }
// //   }
// //   return null;
// // }
 
// // function getCSRFToken() {
// //   const name = "csrftoken=";
// //   for (let c of decodeURIComponent(document.cookie).split(";")) {
// //     c = c.trim();
// //     if (c.startsWith(name)) return c.slice(name.length);
// //   }
// //   return "";
// // }
 
// // /* ================================================================
// //    DETAIL PANEL BUILDER  —  polished card rendered in the DOM
// // ================================================================ */
// // function buildInvoicePanel(rawDetail) {
// //   const d = parseInvoiceDetails(rawDetail);
// //   if (!d) return `<div class="dp-empty">No detail available for this entry.</div>`;
 
// //   const type = d.type || "";
// //   const meta = getTxnMeta(type);
 
// //   /* ── Serial chips ── */
// //   function serialChips(serials) {
// //     if (!serials || !serials.length) return '<span class="dp-none">—</span>';
// //     return `<div class="dp-serial-list">${serials.map(s => {
// //       const price   = s.sold_price != null ? `<span class="dps-price">${fmt(s.sold_price)}</span>` : "";
// //       const comment = s.comment ? `<span class="dps-comment">${escHtml(s.comment)}</span>` : "";
// //       return `<span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(s.serial)}</span>${price}${comment}</span>`;
// //     }).join("")}</div>`;
// //   }
 
// //   /* ── Items table for invoices ── */
// //   function invoiceItemsTable(items) {
// //     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
// //     const rows = items.map((it, i) => `
// //       <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
// //         <td class="dp-td dp-td-num">${i + 1}</td>
// //         <td class="dp-td">
// //           <div class="dp-item-name">${escHtml(it.item_name || "")}</div>
// //           ${it.serials ? serialChips(it.serials) : ""}
// //         </td>
// //         <td class="dp-td dp-td-r">${it.qty ?? "—"}</td>
// //         <td class="dp-td dp-td-r">${fmt(it.unit_price)}</td>
// //         <td class="dp-td dp-td-r dp-td-total">${fmt(it.line_total)}</td>
// //       </tr>`).join("");
// //     return `
// //       <table class="dp-items-table">
// //         <thead><tr>
// //           <th class="dp-th dp-th-num">#</th>
// //           <th class="dp-th">Item &amp; Serials</th>
// //           <th class="dp-th dp-th-r">Qty</th>
// //           <th class="dp-th dp-th-r">Unit Price</th>
// //           <th class="dp-th dp-th-r">Total</th>
// //         </tr></thead>
// //         <tbody>${rows}</tbody>
// //         <tfoot><tr>
// //           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
// //           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
// //         </tr></tfoot>
// //       </table>`;
// //   }
 
// //   /* ── Items table for Purchase Return ── */
// //   function prItemsTable(items) {
// //     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
// //     return `
// //       <table class="dp-items-table">
// //         <thead><tr>
// //           <th class="dp-th dp-th-num">#</th>
// //           <th class="dp-th">Item</th>
// //           <th class="dp-th">Serial Number</th>
// //           <th class="dp-th dp-th-r">Unit Price</th>
// //         </tr></thead>
// //         <tbody>${items.map((it, i) => `
// //           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
// //             <td class="dp-td dp-td-num">${i + 1}</td>
// //             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
// //             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
// //             <td class="dp-td dp-td-r dp-td-total">${fmt(it.unit_price)}</td>
// //           </tr>`).join("")}
// //         </tbody>
// //         <tfoot><tr>
// //           <td colspan="3" class="dp-td dp-tfoot-label">Grand Total</td>
// //           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
// //         </tr></tfoot>
// //       </table>`;
// //   }
 
// //   /* ── Items table for Sale Return ── */
// //   function srItemsTable(items) {
// //     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
// //     return `
// //       <table class="dp-items-table">
// //         <thead><tr>
// //           <th class="dp-th dp-th-num">#</th>
// //           <th class="dp-th">Item</th>
// //           <th class="dp-th">Serial Number</th>
// //           <th class="dp-th dp-th-r">Sold Price</th>
// //           <th class="dp-th dp-th-r">Cost Price</th>
// //         </tr></thead>
// //         <tbody>${items.map((it, i) => `
// //           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
// //             <td class="dp-td dp-td-num">${i + 1}</td>
// //             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
// //             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
// //             <td class="dp-td dp-td-r">${fmt(it.sold_price)}</td>
// //             <td class="dp-td dp-td-r dp-td-total">${fmt(it.cost_price)}</td>
// //           </tr>`).join("")}
// //         </tbody>
// //         <tfoot><tr>
// //           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
// //           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
// //         </tr></tfoot>
// //       </table>`;
// //   }
 
// //   /* ── Payment / Receipt field grid ── */
// //   function paymentCard(fields) {
// //     const visible = fields.filter(([, v]) => v !== null && v !== undefined && v !== "");
// //     return `<div class="dp-pay-grid">
// //       ${visible.map(([label, val]) => `
// //         <div class="dp-pay-row">
// //           <span class="dp-pay-label">${label}</span>
// //           <span class="dp-pay-val">${escHtml(String(val))}</span>
// //         </div>`).join("")}
// //     </div>`;
// //   }
 
// //   /* ── Top strip shared across all types ── */
// //   function topStrip(refLabel, refNum, partyLabel, partyVal, dateVal, amtLabel, amtVal) {
// //     return `
// //       <div class="dp-top-strip dp-strip-${meta.badge}">
// //         <div class="dp-strip-left">
// //           <span class="dp-strip-badge ${meta.badge}">${meta.icon} ${meta.label}</span>
// //           <span class="dp-strip-ref">${refLabel} <strong>#${refNum}</strong></span>
// //         </div>
// //         <div class="dp-strip-mid">
// //           <span class="dp-strip-field">
// //             <span class="dp-sf-label">${partyLabel}</span>
// //             <span class="dp-sf-val">${escHtml(partyVal || "—")}</span>
// //           </span>
// //           <span class="dp-strip-field">
// //             <span class="dp-sf-label">Date</span>
// //             <span class="dp-sf-val">${dateVal || "—"}</span>
// //           </span>
// //         </div>
// //         <div class="dp-strip-right">
// //           <span class="dp-sf-label">${amtLabel}</span>
// //           <span class="dp-strip-amount">${fmt(amtVal)}</span>
// //         </div>
// //       </div>`;
// //   }
 
// //   /* ── Dispatch by type ── */
// //   if (type === "Sale Invoice") {
// //     return topStrip("Invoice", d.sales_invoice_id, "Customer", d.customer, d.invoice_date, "Total", d.total_amount)
// //          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;
 
// //   } else if (type === "Purchase Invoice") {
// //     return topStrip("Invoice", d.purchase_invoice_id, "Vendor", d.vendor, d.invoice_date, "Total", d.total_amount)
// //          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;
 
// //   } else if (type === "Receipt") {
// //     return topStrip("Receipt", d.receipt_id, "Party", d.party, d.receipt_date, "Amount", d.amount)
// //          + `<div class="dp-body">${paymentCard([
// //               ["Method",      d.method],
// //               ["Reference #", d.reference_no],
// //               ["Notes",       d.notes],
// //               ["Description", d.description],
// //             ])}</div>`;
 
// //   } else if (type === "Payment") {
// //     return topStrip("Payment", d.payment_id, "Party", d.party, d.payment_date, "Amount", d.amount)
// //          + `<div class="dp-body">${paymentCard([
// //               ["Method",      d.method],
// //               ["Reference #", d.reference_no],
// //               ["Notes",       d.notes],
// //               ["Description", d.description],
// //             ])}</div>`;
 
// //   } else if (type === "Purchase Return") {
// //     return topStrip("Return", d.purchase_return_id, "Vendor", d.vendor, d.return_date, "Total", d.total_amount)
// //          + `<div class="dp-body">${prItemsTable(d.items)}</div>`;
 
// //   } else if (type === "Sale Return") {
// //     return topStrip("Return", d.sales_return_id, "Customer", d.customer, d.return_date, "Total", d.total_amount)
// //          + `<div class="dp-body">${srItemsTable(d.items)}</div>`;
 
// //   } else {
// //     return `<div class="dp-empty">Unknown transaction type: ${escHtml(type)}</div>`;
// //   }
// // }
 
// // /* ================================================================
// //    MAIN TABLE RENDERER
// // ================================================================ */
// // function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
// //   const container = document.getElementById("ledger2-container");
// //   if (!container) return;
 
// //   if (!rows || rows.length === 0) {
// //     container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
// //     return;
// //   }
 
// //   let totalDebit = 0, totalCredit = 0;
// //   rows.forEach(r => {
// //     totalDebit  += parseFloat(r.debit  || 0);
// //     totalCredit += parseFloat(r.credit || 0);
// //   });
// //   const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);
 
// //   let lastMonth = null;
 
// //   const rowsHtml = rows.map((r, idx) => {
// //     const d    = parseInvoiceDetails(r.invoice_details);
// //     const type = d ? (d.type || "") : "";
// //     const meta = getTxnMeta(type);
// //     const bal  = parseFloat(r.running_balance || 0);
// //     const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
// //     const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";
 
// //     const rowMonth = r.entry_date ? r.entry_date.slice(0, 7) : "";
// //     let separator  = "";
// //     if (rowMonth !== lastMonth) {
// //       lastMonth = rowMonth;
// //       const monthLabel = r.entry_date
// //         ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
// //         : "";
// //       separator = `<tr class="month-sep-row"><td colspan="8"><span class="month-sep-label">📅 ${monthLabel}</span></td></tr>`;
// //     }
 
// //     const hasDetail = !!d;
// //     const detailId  = `detail-${idx}`;
 
// //     return `${separator}
// //     <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
// //       <td class="col-date">${r.entry_date || "—"}</td>
// //       <td class="col-jid">${r.journal_id || "—"}</td>
// //       <td class="col-type">
// //         <span class="txn-badge ${meta.badge}">
// //           <span class="txn-icon">${meta.icon}</span>${meta.label}
// //         </span>
// //       </td>
// //       <td class="col-desc">${escHtml(r.description || "")}</td>
// //       <td class="col-debit  text-right">${parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : ""}</td>
// //       <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
// //       <td class="col-bal text-right">
// //         <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
// //         ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
// //       </td>
// //       <td class="col-toggle">
// //         ${hasDetail
// //           ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
// //                <span class="expand-icon">▼</span>
// //              </button>`
// //           : ""}
// //       </td>
// //     </tr>
// //     ${hasDetail ? `
// //     <tr class="detail-row" id="${detailId}" style="display:none;">
// //       <td colspan="8" class="detail-cell">
// //         <div class="detail-panel-wrap">
// //           ${buildInvoicePanel(r.invoice_details)}
// //         </div>
// //       </td>
// //     </tr>` : ""}`;
// //   }).join("");
 
// //   const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
// //   const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)"
// //                      : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";
 
// //   container.innerHTML = `
// //     <div class="ledger2-header-bar">
// //       <div class="ledger2-party-info">
// //         <span class="ledger2-party-name">${escHtml(partyName)}</span>
// //         <span class="ledger2-period">${fromDate} → ${toDate}</span>
// //       </div>
// //       <div class="ledger2-summary-chips">
// //         <div class="summary-chip chip-debit">
// //           <span class="chip-label">Total Debit</span>
// //           <span class="chip-value">${fmt(totalDebit)}</span>
// //         </div>
// //         <div class="summary-chip chip-credit">
// //           <span class="chip-label">Total Credit</span>
// //           <span class="chip-value">${fmt(totalCredit)}</span>
// //         </div>
// //         <div class="summary-chip chip-balance ${closingClass}">
// //           <span class="chip-label">Closing Balance</span>
// //           <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
// //           <span class="chip-sub">${closingLabel}</span>
// //         </div>
// //       </div>
// //     </div>
 
// //     <div class="ledger2-table-wrap">
// //       <table class="ledger2-table" id="ledger2Table">
// //         <thead>
// //           <tr>
// //             <th class="col-date">Date</th>
// //             <th class="col-jid">J#</th>
// //             <th class="col-type">Type</th>
// //             <th class="col-desc">Description</th>
// //             <th class="col-debit  text-right">Debit</th>
// //             <th class="col-credit text-right">Credit</th>
// //             <th class="col-bal   text-right">Balance</th>
// //             <th class="col-toggle"></th>
// //           </tr>
// //         </thead>
// //         <tbody>${rowsHtml}</tbody>
// //         <tfoot>
// //           <tr class="ledger2-foot">
// //             <td colspan="4" class="foot-label">Totals</td>
// //             <td class="text-right foot-total">${fmt(totalDebit)}</td>
// //             <td class="text-right foot-total">${fmt(totalCredit)}</td>
// //             <td colspan="2" class="text-right foot-balance ${closingClass}">
// //               ${fmt(Math.abs(closingBal))}
// //               <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
// //             </td>
// //           </tr>
// //         </tfoot>
// //       </table>
// //     </div>
 
// //     <div class="ledger2-actions">
// //       <button class="l2-btn l2-btn-pdf"     onclick="downloadLedger2PDF(false)">📄 PDF — Summary</button>
// //       <button class="l2-btn l2-btn-pdf-det" onclick="downloadLedger2PDF(true)">📋 PDF — With Details</button>
// //       <button class="l2-btn l2-btn-csv"     onclick="downloadLedger2CSV()">📊 Download CSV</button>
// //       <button class="l2-btn l2-btn-expand"  onclick="expandAllDetails()">⊞ Expand All</button>
// //       <button class="l2-btn l2-btn-collapse"onclick="collapseAllDetails()">⊟ Collapse All</button>
// //     </div>`;
 
// //   window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
// // }
 
// // /* ── Toggle expand ─────────────────────────────────────────── */
// // function toggleDetail(id, btn) {
// //   const row = document.getElementById(id);
// //   if (!row) return;
// //   const isHidden = row.style.display === "none";
// //   row.style.display = isHidden ? "table-row" : "none";
// //   const icon = btn.querySelector(".expand-icon");
// //   if (icon) icon.textContent = isHidden ? "▲" : "▼";
// //   btn.classList.toggle("expanded", isHidden);
// // }
 
// // function expandAllDetails() {
// //   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
// //   document.querySelectorAll(".expand-btn").forEach(b => {
// //     b.classList.add("expanded");
// //     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▲";
// //   });
// // }
 
// // function collapseAllDetails() {
// //   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
// //   document.querySelectorAll(".expand-btn").forEach(b => {
// //     b.classList.remove("expanded");
// //     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▼";
// //   });
// // }
 
// // /* ── Fetch ─────────────────────────────────────────────────── */
// // function fetchDetailedLedger2() {
// //   const partyName = document.getElementById("l2_party_name").value.trim();
// //   const fromDate  = document.getElementById("l2_from_date").value;
// //   const toDate    = document.getElementById("l2_to_date").value;
 
// //   if (!partyName || !fromDate || !toDate) {
// //     Swal.fire("Missing Fields", "Please fill in all fields.", "warning"); return;
// //   }
 
// //   Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });
 
// //   fetch("/accountsReports/detailed-ledger2/", {
// //     method: "POST",
// //     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
// //     body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
// //   })
// //     .then(res => res.json())
// //     .then(data => {
// //       Swal.close();
// //       if (data.error) { Swal.fire("Error", data.error, "error"); return; }
// //       renderDetailedLedger2(data, partyName, fromDate, toDate);
// //     })
// //     .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
// // }
 
// // /* ================================================================
// //    PDF  —  two modes
// //    downloadLedger2PDF(false)  →  Summary (landscape, table only)
// //    downloadLedger2PDF(true)   →  Detailed (portrait, per-row cards)
// // ================================================================ */
// // function downloadLedger2PDF(withDetails) {
// //   const { jsPDF } = window.jspdf;
// //   const d = window._ledger2Data;
// //   if (!d) { Swal.fire("No Data", "Generate the ledger first.", "warning"); return; }
 
// //   const orientation = withDetails ? "p" : "l";
// //   const doc  = new jsPDF(orientation, "pt", "a4");
// //   const pageW = doc.internal.pageSize.width;
// //   const pageH = doc.internal.pageSize.height;
 
// //   /* ── shared page header ── */
// //   function drawPageHeader() {
// //     doc.setFillColor(30, 58, 128);
// //     doc.rect(0, 0, pageW, 52, "F");
// //     doc.setTextColor(255, 255, 255);
// //     doc.setFontSize(14); doc.setFont("helvetica", "bold");
// //     doc.text(`Party Ledger  —  ${d.partyName}`, 18, 22);
// //     doc.setFontSize(8); doc.setFont("helvetica", "normal");
// //     doc.text(`Period: ${d.fromDate}  →  ${d.toDate}`, 18, 37);
// //     const sumTxt = `Total Debit: ${fmt(d.totalDebit)}    Total Credit: ${fmt(d.totalCredit)}    Closing: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`;
// //     doc.text(sumTxt, pageW - 18, 37, { align: "right" });
// //     doc.setTextColor(0);
// //   }
 
// //   function addPageNumbers() {
// //     const total = doc.internal.getNumberOfPages();
// //     for (let i = 1; i <= total; i++) {
// //       doc.setPage(i);
// //       doc.setFontSize(7); doc.setTextColor(140);
// //       doc.text(`Page ${i} of ${total}`, pageW - 18, pageH - 12, { align: "right" });
// //       doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, 18, pageH - 12);
// //       doc.setTextColor(0);
// //     }
// //   }
 
// //   /* ══════════════════════════════════
// //      MODE A — Summary (landscape)
// //   ══════════════════════════════════ */
// //   if (!withDetails) {
// //     drawPageHeader();
 
// //     const tableRows = d.rows.map(r => {
// //       const inv  = parseInvoiceDetails(r.invoice_details);
// //       const type = inv ? (inv.type || "") : "";
// //       const bal  = parseFloat(r.running_balance || 0);
// //       return [
// //         r.entry_date  || "",
// //         String(r.journal_id || ""),
// //         type,
// //         r.description || "",
// //         parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
// //         parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
// //         `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
// //       ];
// //     });
 
// //     doc.autoTable({
// //       head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
// //       body: tableRows,
// //       startY: 60,
// //       theme: "grid",
// //       headStyles: { fillColor: [30, 80, 160], textColor: 255, fontSize: 8, fontStyle: "bold" },
// //       alternateRowStyles: { fillColor: [245, 247, 253] },
// //       styles: { fontSize: 7.5, cellPadding: 4 },
// //       columnStyles: {
// //         0: { cellWidth: 62 }, 1: { cellWidth: 32, halign: "center" },
// //         2: { cellWidth: 82 }, 3: { cellWidth: 230 },
// //         4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 72, halign: "right" },
// //         6: { cellWidth: 80, halign: "right" },
// //       },
// //       foot: [["", "", "", "TOTALS",
// //         fmt(d.totalDebit), fmt(d.totalCredit),
// //         `${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`]],
// //       footStyles: { fillColor: [30, 58, 128], textColor: 255, fontStyle: "bold", fontSize: 8 },
// //     });
 
// //     addPageNumbers();
// //     doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Summary.pdf`);
// //     return;
// //   }
 
// //   /* ══════════════════════════════════════════
// //      MODE B — Detailed (portrait A4)
// //      Each ledger row renders as a colour-coded
// //      card with its full invoice detail below.
// //   ══════════════════════════════════════════ */
// //   const MARGIN  = 18;
// //   const CONTENT = pageW - MARGIN * 2;
 
// //   const TYPE_TINT = {
// //     "Sale Invoice":     [232, 244, 255], "Purchase Invoice": [243, 240, 255],
// //     "Receipt":          [232, 255, 242], "Payment":          [255, 243, 232],
// //     "Sale Return":      [255, 251, 224], "Purchase Return":  [232, 240, 255],
// //   };
// //   const TYPE_ACCENT = {
// //     "Sale Invoice":     [21, 101, 192], "Purchase Invoice": [91,  33, 182],
// //     "Receipt":          [21, 127,  75], "Payment":          [194, 65,  12],
// //     "Sale Return":      [180, 83,   9], "Purchase Return":  [30,  64, 175],
// //   };
 
// //   drawPageHeader();
// //   let curY = 60;
 
// //   function checkNewPage(needed) {
// //     if (curY + needed > pageH - 28) {
// //       doc.addPage();
// //       curY = 18;
// //     }
// //   }
 
// //   d.rows.forEach(r => {
// //     const inv   = parseInvoiceDetails(r.invoice_details);
// //     const type  = inv ? (inv.type || "") : "";
// //     const meta  = getTxnMeta(type);
// //     const bal   = parseFloat(r.running_balance || 0);
// //     const tint  = TYPE_TINT[type]   || [245, 245, 245];
// //     const acc   = TYPE_ACCENT[type] || [80, 80, 80];
 
// //     /* ── Accent header bar ── */
// //     checkNewPage(22);
// //     doc.setFillColor(...acc);
// //     doc.rect(MARGIN, curY, CONTENT, 20, "F");
// //     doc.setTextColor(255);
// //     doc.setFontSize(8); doc.setFont("helvetica", "bold");
// //     doc.text(`${meta.icon}  ${type}   |   J# ${r.journal_id || ""}   |   ${r.entry_date || ""}`, MARGIN + 6, curY + 13);
 
// //     const drCrTxt = [
// //       parseFloat(r.debit  || 0) > 0 ? `Dr: ${fmt(r.debit)}`  : "",
// //       parseFloat(r.credit || 0) > 0 ? `Cr: ${fmt(r.credit)}` : "",
// //       `Bal: ${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
// //     ].filter(Boolean).join("   ");
// //     doc.setFont("helvetica", "normal");
// //     doc.text(drCrTxt, MARGIN + CONTENT - 6, curY + 13, { align: "right" });
// //     doc.setTextColor(0);
// //     curY += 20;
 
// //     /* ── Description sub-bar ── */
// //     if (r.description) {
// //       checkNewPage(14);
// //       doc.setFillColor(240, 242, 250);
// //       doc.rect(MARGIN, curY, CONTENT, 14, "F");
// //       doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 100);
// //       doc.text(String(r.description), MARGIN + 6, curY + 10);
// //       doc.setTextColor(0);
// //       curY += 14;
// //     }
 
// //     if (!inv) { curY += 6; return; }
 
// //     const isPayment = type === "Receipt" || type === "Payment";
 
// //     if (isPayment) {
// //       /* ── Receipt / Payment detail grid ── */
// //       const fields = [
// //         ["Party",       inv.party || "—"],
// //         ["Date",        inv.receipt_date || inv.payment_date || "—"],
// //         ["Amount",      fmt(inv.amount)],
// //         ["Method",      inv.method || "—"],
// //         ["Reference #", inv.reference_no || "—"],
// //         ...(inv.notes       ? [["Notes",       inv.notes]]       : []),
// //         ...(inv.description ? [["Description", inv.description]] : []),
// //       ];
 
// //       const COLS   = 3;
// //       const CELL_W = CONTENT / COLS;
// //       const CELL_H = 18;
// //       const gridH  = Math.ceil(fields.length / COLS) * CELL_H + 6;
// //       checkNewPage(gridH);
// //       doc.setFillColor(...tint);
// //       doc.rect(MARGIN, curY, CONTENT, gridH, "F");
 
// //       fields.forEach(([label, val], fi) => {
// //         const col = fi % COLS;
// //         const row = Math.floor(fi / COLS);
// //         const cx  = MARGIN + col * CELL_W + 6;
// //         const cy  = curY + row * CELL_H + 11;
// //         doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
// //         doc.text(label.toUpperCase(), cx, cy);
// //         doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.setFontSize(8);
// //         doc.text(String(val), cx, cy + 8);
// //       });
// //       curY += gridH + 4;
 
// //     } else {
// //       /* ── Invoice / Return items table ── */
// //       const items = inv.items || [];
// //       if (items.length === 0) { curY += 6; return; }
 
// //       /* party / date info bar */
// //       checkNewPage(18);
// //       doc.setFillColor(...tint);
// //       doc.rect(MARGIN, curY, CONTENT, 18, "F");
// //       doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
// //       const pLabel = ["Sale Invoice", "Sale Return"].includes(type) ? "Customer" : "Vendor";
// //       const pVal   = inv.customer || inv.vendor || "—";
// //       const dVal   = inv.invoice_date || inv.return_date || "—";
// //       doc.text(`${pLabel}: ${pVal}   |   Date: ${dVal}   |   Total: ${fmt(inv.total_amount)}`, MARGIN + 6, curY + 12);
// //       doc.setTextColor(0);
// //       curY += 18;
 
// //       const isSaleRet  = type === "Sale Return";
// //       const isPurchRet = type === "Purchase Return";
 
// //       const iHead = isSaleRet
// //         ? ["#", "Item", "Serial", "Sold Price", "Cost Price"]
// //         : isPurchRet
// //         ? ["#", "Item", "Serial", "Unit Price"]
// //         : ["#", "Item", "Serials", "Qty", "Unit Price", "Total"];
 
// //       const iBody = items.map((it, i) => {
// //         const sNum   = it.serial_number || "";
// //         const serStr = it.serials
// //           ? it.serials.map(s => s.serial + (s.sold_price != null ? ` @${fmt(s.sold_price)}` : "")).join(", ")
// //           : sNum;
// //         if (isSaleRet)  return [i+1, it.item_name||"", sNum,   fmt(it.sold_price), fmt(it.cost_price)];
// //         if (isPurchRet) return [i+1, it.item_name||"", sNum,   fmt(it.unit_price)];
// //         return              [i+1, it.item_name||"", serStr, it.qty??0, fmt(it.unit_price), fmt(it.line_total)];
// //       });
 
// //       const iColW = isSaleRet
// //         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"}, 4:{cellWidth:80,halign:"right"} }
// //         : isPurchRet
// //         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"} }
// //         : { 0:{cellWidth:18}, 1:{cellWidth:130}, 2:{cellWidth:130}, 3:{cellWidth:30,halign:"center"}, 4:{cellWidth:75,halign:"right"}, 5:{cellWidth:75,halign:"right"} };
 
// //       doc.autoTable({
// //         head:  [iHead],
// //         body:  iBody,
// //         startY: curY,
// //         margin: { left: MARGIN, right: MARGIN },
// //         theme:  "grid",
// //         headStyles: { fillColor: acc, textColor: 255, fontSize: 7, fontStyle: "bold", cellPadding: 3 },
// //         alternateRowStyles: { fillColor: tint },
// //         styles: { fontSize: 7, cellPadding: 3 },
// //         columnStyles: iColW,
// //         tableWidth: CONTENT,
// //       });
// //       curY = doc.lastAutoTable.finalY + 4;
// //     }
 
// //     /* ── thin separator line ── */
// //     checkNewPage(10);
// //     doc.setDrawColor(...acc); doc.setLineWidth(0.3);
// //     doc.line(MARGIN, curY, MARGIN + CONTENT, curY);
// //     curY += 8;
// //   });
 
// //   addPageNumbers();
// //   doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Detailed.pdf`);
// // }
 
// // /* ── CSV ───────────────────────────────────────────────────── */
// // function downloadLedger2CSV() {
// //   const d = window._ledger2Data;
// //   if (!d) return;
// //   const lines = [
// //     ["Party Ledger", d.partyName],
// //     ["Period", `${d.fromDate} to ${d.toDate}`],
// //     [],
// //     ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
// //   ];
// //   d.rows.forEach(r => {
// //     const inv  = parseInvoiceDetails(r.invoice_details);
// //     const type = inv ? (inv.type || "") : "";
// //     const bal  = parseFloat(r.running_balance || 0);
// //     lines.push([
// //       r.entry_date  || "", r.journal_id  || "", type, r.description || "",
// //       parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
// //       parseFloat(r.credit || 0) > 0 ? r.credit : "",
// //       Math.abs(bal).toFixed(2), bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
// //     ]);
// //   });
// //   const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
// //   const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
// //   const url  = URL.createObjectURL(blob);
// //   const a    = document.createElement("a");
// //   a.href = url; a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
// //   document.body.appendChild(a); a.click(); document.body.removeChild(a);
// // }
 
// // /* ── Autocomplete ──────────────────────────────────────────── */
// // function initLedger2Autocomplete() {
// //   const $input = $("#l2_party_name"), $sugg = $("#l2_suggestions");
// //   const url    = "/parties/autocomplete-party";
// //   let idx = -1, current = [];
 
// //   $input.on("input", function () {
// //     const q = $(this).val(); idx = -1;
// //     if (q.length < 1) { $sugg.hide(); return; }
// //     $.ajax({ url, data: { term: q }, dataType: "json",
// //       success(data) {
// //         $sugg.empty(); current = data;
// //         if (data.length) {
// //           data.forEach((p, i) => $("<div>").addClass("suggestion-item").text(p)
// //             .on("mouseenter", function() { $(".suggestion-item").removeClass("highlight"); $(this).addClass("highlight"); idx = i; })
// //             .on("click", function() { $input.val(p); $sugg.hide(); })
// //             .appendTo($sugg));
// //           $sugg.show();
// //         } else $sugg.hide();
// //       }
// //     });
// //   });
 
// //   $input.on("keydown", function (e) {
// //     const items = $sugg.children(".suggestion-item");
// //     if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx+1)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
// //     else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx-1+items.length)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
// //     else if (e.key === "Enter") {
// //       if (current.length===1) { $input.val(current[0]); $sugg.hide(); }
// //       else if (idx>=0) { $input.val($(items[idx]).text()); $sugg.hide(); }
// //     } else if (e.key === "Escape") $sugg.hide();
// //   });
 
// //   $(document).on("click", e => {
// //     if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $sugg.hide();
// //   });
// // }
 
// // /* ── Form ──────────────────────────────────────────────────── */
// // function renderLedger2Form() {
// //   const today = new Date().toISOString().split("T")[0];
// //   const yearStart = `${new Date().getFullYear()}-01-01`;
// //   document.getElementById("ledger2-form-area").innerHTML = `
// //     <div class="l2-form-row">
// //       <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
// //         <label class="l2-label" for="l2_party_name">Party Name</label>
// //         <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…" autocomplete="off">
// //         <div id="l2_suggestions" class="suggestions-dropdown"></div>
// //       </div>
// //       <div class="l2-field">
// //         <label class="l2-label" for="l2_from_date">From Date</label>
// //         <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
// //       </div>
// //       <div class="l2-field">
// //         <label class="l2-label" for="l2_to_date">To Date</label>
// //         <input type="date" id="l2_to_date" class="l2-input" value="${today}">
// //       </div>
// //       <div class="l2-field l2-field-btn">
// //         <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
// //       </div>
// //     </div>`;
// //   initLedger2Autocomplete();
// // }
 
// // /* ── selectReport override (loads after accounts_reports.js) ── */
// // function selectReport(type) {
// //   $(".report-btn").removeClass("active");
// //   const btnMap = {
// //     "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
// //     "receivable": "btn-receivable", "payable": "btn-payable",
// //     "trial": "btn-trial", "ledger2": "btn-ledger2",
// //   };
// //   if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");
 
// //   document.getElementById("ledger2-section").style.display = type === "ledger2" ? "block" : "none";
// //   document.getElementById("classic-section").style.display = type !== "ledger2" ? "block" : "none";
 
// //   if (type === "ledger2") {
// //     renderLedger2Form();
// //     document.getElementById("ledger2-container").innerHTML =
// //       `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
// //     return;
// //   }
 
// //   const $formSection = $("#report-form-container");
// //   $formSection.empty();
// //   $("#reportHeader").html("");
// //   $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);
 
// //   if      (type === "ledger")      renderLedgerForm();
// //   else if (type === "cash-ledger") renderCashLedgerForm();
// //   else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
// //   else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
// //   else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
// // }
 
// // $(document).ready(() => selectReport("ledger2"));


// // ================================================================
// //  detailed_ledger2.js  –  Professional Party Ledger  (v2)
// // ================================================================

// /* ── Transaction metadata ─────────────────────────────────── */
// const TXN_META = {
//   "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"           },
//   "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"       },
//   "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"        },
//   "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"        },
//   "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"    },
//   "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return"  },
// };
// function getTxnMeta(type) {
//   return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
// }

// /* ── Number formatter ─────────────────────────────────────── */
// function fmt(n) {
//   if (n === null || n === undefined || n === "") return "—";
//   const num = parseFloat(n);
//   if (isNaN(num)) return "—";
//   return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// }

// function escHtml(str) {
//   if (str === null || str === undefined) return "";
//   return String(str)
//     .replace(/&/g, "&amp;").replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// }

// /* ─────────────────────────────────────────────────────────────
//    CRITICAL FIX: invoice_details can arrive as a JSON string
//    from Django – always normalise to a plain object.
// ───────────────────────────────────────────────────────────── */
// function parseInvoiceDetails(raw) {
//   if (!raw) return null;
//   if (typeof raw === "object") return raw;
//   if (typeof raw === "string") {
//     try { return JSON.parse(raw); } catch { return null; }
//   }
//   return null;
// }

// function getCSRFToken() {
//   const name = "csrftoken=";
//   for (let c of decodeURIComponent(document.cookie).split(";")) {
//     c = c.trim();
//     if (c.startsWith(name)) return c.slice(name.length);
//   }
//   return "";
// }

// /* ================================================================
//    DETAIL PANEL BUILDER  —  polished card rendered in the DOM
// ================================================================ */
// function buildInvoicePanel(rawDetail) {
//   const d = parseInvoiceDetails(rawDetail);
//   if (!d) return `<div class="dp-empty">No detail available for this entry.</div>`;

//   const type = d.type || "";
//   const meta = getTxnMeta(type);

//   /* ── Serial chips ── */
//   function serialChips(serials) {
//     if (!serials || !serials.length) return '<span class="dp-none">—</span>';
//     return `<div class="dp-serial-list">${serials.map(s => {
//       const price   = s.sold_price != null ? `<span class="dps-price">${fmt(s.sold_price)}</span>` : "";
//       const comment = s.comment ? `<span class="dps-comment">${escHtml(s.comment)}</span>` : "";
//       return `<span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(s.serial)}</span>${price}${comment}</span>`;
//     }).join("")}</div>`;
//   }

//   /* ── Items table for invoices ── */
//   function invoiceItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     const rows = items.map((it, i) => `
//       <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//         <td class="dp-td dp-td-num">${i + 1}</td>
//         <td class="dp-td">
//           <div class="dp-item-name">${escHtml(it.item_name || "")}</div>
//           ${it.serials ? serialChips(it.serials) : ""}
//         </td>
//         <td class="dp-td dp-td-r">${it.qty ?? "—"}</td>
//         <td class="dp-td dp-td-r">${fmt(it.unit_price)}</td>
//         <td class="dp-td dp-td-r dp-td-total">${fmt(it.line_total)}</td>
//       </tr>`).join("");
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item &amp; Serials</th>
//           <th class="dp-th dp-th-r">Qty</th>
//           <th class="dp-th dp-th-r">Unit Price</th>
//           <th class="dp-th dp-th-r">Total</th>
//         </tr></thead>
//         <tbody>${rows}</tbody>
//         <tfoot><tr>
//           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }

//   /* ── Items table for Purchase Return ── */
//   function prItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item</th>
//           <th class="dp-th">Serial Number</th>
//           <th class="dp-th dp-th-r">Unit Price</th>
//         </tr></thead>
//         <tbody>${items.map((it, i) => `
//           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//             <td class="dp-td dp-td-num">${i + 1}</td>
//             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
//             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
//             <td class="dp-td dp-td-r dp-td-total">${fmt(it.unit_price)}</td>
//           </tr>`).join("")}
//         </tbody>
//         <tfoot><tr>
//           <td colspan="3" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }

//   /* ── Items table for Sale Return ── */
//   function srItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item</th>
//           <th class="dp-th">Serial Number</th>
//           <th class="dp-th dp-th-r">Sold Price</th>
//           <th class="dp-th dp-th-r">Cost Price</th>
//         </tr></thead>
//         <tbody>${items.map((it, i) => `
//           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//             <td class="dp-td dp-td-num">${i + 1}</td>
//             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
//             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
//             <td class="dp-td dp-td-r">${fmt(it.sold_price)}</td>
//             <td class="dp-td dp-td-r dp-td-total">${fmt(it.cost_price)}</td>
//           </tr>`).join("")}
//         </tbody>
//         <tfoot><tr>
//           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }

//   /* ── Payment / Receipt field grid ── */
//   function paymentCard(fields) {
//     const visible = fields.filter(([, v]) => v !== null && v !== undefined && v !== "");
//     return `<div class="dp-pay-grid">
//       ${visible.map(([label, val]) => `
//         <div class="dp-pay-row">
//           <span class="dp-pay-label">${label}</span>
//           <span class="dp-pay-val">${escHtml(String(val))}</span>
//         </div>`).join("")}
//     </div>`;
//   }

//   /* ── Top strip shared across all types ── */
//   function topStrip(refLabel, refNum, partyLabel, partyVal, dateVal, amtLabel, amtVal) {
//     return `
//       <div class="dp-top-strip dp-strip-${meta.badge}">
//         <div class="dp-strip-left">
//           <span class="dp-strip-badge ${meta.badge}">${meta.icon} ${meta.label}</span>
//           <span class="dp-strip-ref">${refLabel} <strong>#${refNum}</strong></span>
//         </div>
//         <div class="dp-strip-mid">
//           <span class="dp-strip-field">
//             <span class="dp-sf-label">${partyLabel}</span>
//             <span class="dp-sf-val">${escHtml(partyVal || "—")}</span>
//           </span>
//           <span class="dp-strip-field">
//             <span class="dp-sf-label">Date</span>
//             <span class="dp-sf-val">${dateVal || "—"}</span>
//           </span>
//         </div>
//         <div class="dp-strip-right">
//           <span class="dp-sf-label">${amtLabel}</span>
//           <span class="dp-strip-amount">${fmt(amtVal)}</span>
//         </div>
//       </div>`;
//   }

//   /* ── Dispatch by type ── */
//   if (type === "Sale Invoice") {
//     return topStrip("Invoice", d.sales_invoice_id, "Customer", d.customer, d.invoice_date, "Total", d.total_amount)
//          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;

//   } else if (type === "Purchase Invoice") {
//     return topStrip("Invoice", d.purchase_invoice_id, "Vendor", d.vendor, d.invoice_date, "Total", d.total_amount)
//          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;

//   } else if (type === "Receipt") {
//     return topStrip("Receipt", d.receipt_id, "Party", d.party, d.receipt_date, "Amount", d.amount)
//          + `<div class="dp-body">${paymentCard([
//               ["Method",      d.method],
//               ["Reference #", d.reference_no],
//               ["Notes",       d.notes],
//               ["Description", d.description],
//             ])}</div>`;

//   } else if (type === "Payment") {
//     return topStrip("Payment", d.payment_id, "Party", d.party, d.payment_date, "Amount", d.amount)
//          + `<div class="dp-body">${paymentCard([
//               ["Method",      d.method],
//               ["Reference #", d.reference_no],
//               ["Notes",       d.notes],
//               ["Description", d.description],
//             ])}</div>`;

//   } else if (type === "Purchase Return") {
//     return topStrip("Return", d.purchase_return_id, "Vendor", d.vendor, d.return_date, "Total", d.total_amount)
//          + `<div class="dp-body">${prItemsTable(d.items)}</div>`;

//   } else if (type === "Sale Return") {
//     return topStrip("Return", d.sales_return_id, "Customer", d.customer, d.return_date, "Total", d.total_amount)
//          + `<div class="dp-body">${srItemsTable(d.items)}</div>`;

//   } else {
//     return `<div class="dp-empty">Unknown transaction type: ${escHtml(type)}</div>`;
//   }
// }

// /* ================================================================
//    MAIN TABLE RENDERER
// ================================================================ */
// function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
//   const container = document.getElementById("ledger2-container");
//   if (!container) return;

//   if (!rows || rows.length === 0) {
//     container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
//     return;
//   }

//   let totalDebit = 0, totalCredit = 0;
//   rows.forEach(r => {
//     totalDebit  += parseFloat(r.debit  || 0);
//     totalCredit += parseFloat(r.credit || 0);
//   });
//   const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);

//   // Opening balance = running_balance of first row MINUS its own debit/credit contribution
//   const firstRow      = rows[0];
//   const firstBal      = parseFloat(firstRow.running_balance || 0);
//   const firstAmount   = parseFloat(firstRow.debit || 0) - parseFloat(firstRow.credit || 0);
//   const openingBal    = firstBal - firstAmount;
//   const hasOpeningBal = openingBal !== 0;

//   const obClass = openingBal > 0 ? "bal-dr" : openingBal < 0 ? "bal-cr" : "bal-zero";
//   const obLabel = openingBal > 0 ? "Dr" : openingBal < 0 ? "Cr" : "";

//   const openingRow = hasOpeningBal ? `
//     <tr class="opening-bal-row">
//       <td class="col-date ob-date">${fromDate}</td>
//       <td class="col-jid">—</td>
//       <td class="col-type"><span class="txn-badge txn-opening">⊙ Opening</span></td>
//       <td class="col-desc ob-label">Opening Balance (brought forward)</td>
//       <td class="col-debit  text-right">${openingBal > 0 ? fmt(openingBal)  : ""}</td>
//       <td class="col-credit text-right">${openingBal < 0 ? fmt(Math.abs(openingBal)) : ""}</td>
//       <td class="col-bal text-right">
//         <span class="bal-amount ${obClass}">${fmt(Math.abs(openingBal))}</span>
//         ${obLabel ? `<span class="bal-dr-cr">${obLabel}</span>` : ""}
//       </td>
//       <td class="col-toggle"></td>
//     </tr>` : "";

//   let lastMonth = null;
//   // If opening balance row is shown, seed lastMonth so the first
//   // real row still gets its month separator.
//   // (leave lastMonth = null so month-sep fires on row 0 as normal)

//   const rowsHtml = rows.map((r, idx) => {
//     const d    = parseInvoiceDetails(r.invoice_details);
//     const type = d ? (d.type || "") : "";
//     const meta = getTxnMeta(type);
//     const bal  = parseFloat(r.running_balance || 0);
//     const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
//     const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";

//     const rowMonth = r.entry_date ? r.entry_date.slice(0, 7) : "";
//     let separator  = "";
//     if (rowMonth !== lastMonth) {
//       lastMonth = rowMonth;
//       const monthLabel = r.entry_date
//         ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
//         : "";
//       separator = `<tr class="month-sep-row"><td colspan="8"><span class="month-sep-label">📅 ${monthLabel}</span></td></tr>`;
//     }

//     const hasDetail = !!d;
//     const detailId  = `detail-${idx}`;

//     return `${separator}
//     <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
//       <td class="col-date">${r.entry_date || "—"}</td>
//       <td class="col-jid">${r.journal_id || "—"}</td>
//       <td class="col-type">
//         <span class="txn-badge ${meta.badge}">
//           <span class="txn-icon">${meta.icon}</span>${meta.label}
//         </span>
//       </td>
//       <td class="col-desc">${escHtml(r.description || "")}</td>
//       <td class="col-debit  text-right">${parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : ""}</td>
//       <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
//       <td class="col-bal text-right">
//         <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
//         ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
//       </td>
//       <td class="col-toggle">
//         ${hasDetail
//           ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
//                <span class="expand-icon">▼</span>
//              </button>`
//           : ""}
//       </td>
//     </tr>
//     ${hasDetail ? `
//     <tr class="detail-row" id="${detailId}" style="display:none;">
//       <td colspan="8" class="detail-cell">
//         <div class="detail-panel-wrap">
//           ${buildInvoicePanel(r.invoice_details)}
//         </div>
//       </td>
//     </tr>` : ""}`;
//   }).join("");

//   const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
//   const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)"
//                      : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";

//   container.innerHTML = `
//     <div class="ledger2-header-bar">
//       <div class="ledger2-party-info">
//         <span class="ledger2-party-name">${escHtml(partyName)}</span>
//         <span class="ledger2-period">${fromDate} → ${toDate}</span>
//       </div>
//       <div class="ledger2-summary-chips">
//         ${hasOpeningBal ? `
//         <div class="summary-chip chip-opening ${obClass}">
//           <span class="chip-label">Opening Balance</span>
//           <span class="chip-value">${fmt(Math.abs(openingBal))}</span>
//           <span class="chip-sub">${openingBal > 0 ? "Debit b/f" : "Credit b/f"}</span>
//         </div>` : ""}
//         <div class="summary-chip chip-debit">
//           <span class="chip-label">Total Debit</span>
//           <span class="chip-value">${fmt(totalDebit)}</span>
//         </div>
//         <div class="summary-chip chip-credit">
//           <span class="chip-label">Total Credit</span>
//           <span class="chip-value">${fmt(totalCredit)}</span>
//         </div>
//         <div class="summary-chip chip-balance ${closingClass}">
//           <span class="chip-label">Closing Balance</span>
//           <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
//           <span class="chip-sub">${closingLabel}</span>
//         </div>
//       </div>
//     </div>

//     <div class="ledger2-table-wrap">
//       <table class="ledger2-table" id="ledger2Table">
//         <thead>
//           <tr>
//             <th class="col-date">Date</th>
//             <th class="col-jid">J#</th>
//             <th class="col-type">Type</th>
//             <th class="col-desc">Description</th>
//             <th class="col-debit  text-right">Debit</th>
//             <th class="col-credit text-right">Credit</th>
//             <th class="col-bal   text-right">Balance</th>
//             <th class="col-toggle"></th>
//           </tr>
//         </thead>
//         <tbody>${openingRow}${rowsHtml}</tbody>
//         <tfoot>
//           <tr class="ledger2-foot">
//             <td colspan="4" class="foot-label">Totals</td>
//             <td class="text-right foot-total">${fmt(totalDebit)}</td>
//             <td class="text-right foot-total">${fmt(totalCredit)}</td>
//             <td colspan="2" class="text-right foot-balance ${closingClass}">
//               ${fmt(Math.abs(closingBal))}
//               <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
//             </td>
//           </tr>
//         </tfoot>
//       </table>
//     </div>

//     <div class="ledger2-actions">
//       <button class="l2-btn l2-btn-pdf"     onclick="downloadLedger2PDF(false)">📄 PDF — Summary</button>
//       <button class="l2-btn l2-btn-pdf-det" onclick="downloadLedger2PDF(true)">📋 PDF — With Details</button>
//       <button class="l2-btn l2-btn-csv"     onclick="downloadLedger2CSV()">📊 Download CSV</button>
//       <button class="l2-btn l2-btn-expand"  onclick="expandAllDetails()">⊞ Expand All</button>
//       <button class="l2-btn l2-btn-collapse"onclick="collapseAllDetails()">⊟ Collapse All</button>
//     </div>`;

//   window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
// }

// /* ── Toggle expand ─────────────────────────────────────────── */
// function toggleDetail(id, btn) {
//   const row = document.getElementById(id);
//   if (!row) return;
//   const isHidden = row.style.display === "none";
//   row.style.display = isHidden ? "table-row" : "none";
//   const icon = btn.querySelector(".expand-icon");
//   if (icon) icon.textContent = isHidden ? "▲" : "▼";
//   btn.classList.toggle("expanded", isHidden);
// }

// function expandAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.add("expanded");
//     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▲";
//   });
// }

// function collapseAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.remove("expanded");
//     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▼";
//   });
// }

// /* ── Fetch ─────────────────────────────────────────────────── */
// function fetchDetailedLedger2() {
//   const partyName = document.getElementById("l2_party_name").value.trim();
//   const fromDate  = document.getElementById("l2_from_date").value;
//   const toDate    = document.getElementById("l2_to_date").value;

//   if (!partyName || !fromDate || !toDate) {
//     Swal.fire("Missing Fields", "Please fill in all fields.", "warning"); return;
//   }

//   Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

//   fetch("/accountsReports/detailed-ledger2/", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
//   })
//     .then(res => res.json())
//     .then(data => {
//       Swal.close();
//       if (data.error) { Swal.fire("Error", data.error, "error"); return; }
//       renderDetailedLedger2(data, partyName, fromDate, toDate);
//     })
//     .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
// }

// /* ================================================================
//    PDF  —  two modes
//    downloadLedger2PDF(false)  →  Summary (landscape, table only)
//    downloadLedger2PDF(true)   →  Detailed (portrait, per-row cards)
// ================================================================ */
// function downloadLedger2PDF(withDetails) {
//   const { jsPDF } = window.jspdf;
//   const d = window._ledger2Data;
//   if (!d) { Swal.fire("No Data", "Generate the ledger first.", "warning"); return; }

//   const orientation = withDetails ? "p" : "l";
//   const doc  = new jsPDF(orientation, "pt", "a4");
//   const pageW = doc.internal.pageSize.width;
//   const pageH = doc.internal.pageSize.height;

//   /* ── shared page header ── */
//   function drawPageHeader() {
//     doc.setFillColor(30, 58, 128);
//     doc.rect(0, 0, pageW, 52, "F");
//     doc.setTextColor(255, 255, 255);
//     doc.setFontSize(14); doc.setFont("helvetica", "bold");
//     doc.text(`Party Ledger  —  ${d.partyName}`, 18, 22);
//     doc.setFontSize(8); doc.setFont("helvetica", "normal");
//     doc.text(`Period: ${d.fromDate}  →  ${d.toDate}`, 18, 37);
//     const sumTxt = `Total Debit: ${fmt(d.totalDebit)}    Total Credit: ${fmt(d.totalCredit)}    Closing: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`;
//     doc.text(sumTxt, pageW - 18, 37, { align: "right" });
//     doc.setTextColor(0);
//   }

//   function addPageNumbers() {
//     const total = doc.internal.getNumberOfPages();
//     for (let i = 1; i <= total; i++) {
//       doc.setPage(i);
//       doc.setFontSize(7); doc.setTextColor(140);
//       doc.text(`Page ${i} of ${total}`, pageW - 18, pageH - 12, { align: "right" });
//       doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, 18, pageH - 12);
//       doc.setTextColor(0);
//     }
//   }

//   /* ══════════════════════════════════
//      MODE A — Summary (landscape)
//   ══════════════════════════════════ */
//   if (!withDetails) {
//     drawPageHeader();

//     const tableRows = d.rows.map(r => {
//       const inv  = parseInvoiceDetails(r.invoice_details);
//       const type = inv ? (inv.type || "") : "";
//       const bal  = parseFloat(r.running_balance || 0);
//       return [
//         r.entry_date  || "",
//         String(r.journal_id || ""),
//         type,
//         r.description || "",
//         parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
//         parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
//         `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
//       ];
//     });

//     doc.autoTable({
//       head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
//       body: tableRows,
//       startY: 60,
//       theme: "grid",
//       headStyles: { fillColor: [30, 80, 160], textColor: 255, fontSize: 8, fontStyle: "bold" },
//       alternateRowStyles: { fillColor: [245, 247, 253] },
//       styles: { fontSize: 7.5, cellPadding: 4 },
//       columnStyles: {
//         0: { cellWidth: 62 }, 1: { cellWidth: 32, halign: "center" },
//         2: { cellWidth: 82 }, 3: { cellWidth: 230 },
//         4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 72, halign: "right" },
//         6: { cellWidth: 80, halign: "right" },
//       },
//       foot: [["", "", "", "TOTALS",
//         fmt(d.totalDebit), fmt(d.totalCredit),
//         `${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`]],
//       footStyles: { fillColor: [30, 58, 128], textColor: 255, fontStyle: "bold", fontSize: 8 },
//     });

//     addPageNumbers();
//     doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Summary.pdf`);
//     return;
//   }

//   /* ══════════════════════════════════════════
//      MODE B — Detailed (portrait A4)
//      Each ledger row renders as a colour-coded
//      card with its full invoice detail below.
//   ══════════════════════════════════════════ */
//   const MARGIN  = 18;
//   const CONTENT = pageW - MARGIN * 2;

//   const TYPE_TINT = {
//     "Sale Invoice":     [232, 244, 255], "Purchase Invoice": [243, 240, 255],
//     "Receipt":          [232, 255, 242], "Payment":          [255, 243, 232],
//     "Sale Return":      [255, 251, 224], "Purchase Return":  [232, 240, 255],
//   };
//   const TYPE_ACCENT = {
//     "Sale Invoice":     [21, 101, 192], "Purchase Invoice": [91,  33, 182],
//     "Receipt":          [21, 127,  75], "Payment":          [194, 65,  12],
//     "Sale Return":      [180, 83,   9], "Purchase Return":  [30,  64, 175],
//   };

//   drawPageHeader();
//   let curY = 60;

//   function checkNewPage(needed) {
//     if (curY + needed > pageH - 28) {
//       doc.addPage();
//       curY = 18;
//     }
//   }

//   d.rows.forEach(r => {
//     const inv   = parseInvoiceDetails(r.invoice_details);
//     const type  = inv ? (inv.type || "") : "";
//     const meta  = getTxnMeta(type);
//     const bal   = parseFloat(r.running_balance || 0);
//     const tint  = TYPE_TINT[type]   || [245, 245, 245];
//     const acc   = TYPE_ACCENT[type] || [80, 80, 80];

//     /* ── Accent header bar ── */
//     checkNewPage(22);
//     doc.setFillColor(...acc);
//     doc.rect(MARGIN, curY, CONTENT, 20, "F");
//     doc.setTextColor(255);
//     doc.setFontSize(8); doc.setFont("helvetica", "bold");
//     doc.text(`${meta.icon}  ${type}   |   J# ${r.journal_id || ""}   |   ${r.entry_date || ""}`, MARGIN + 6, curY + 13);

//     const drCrTxt = [
//       parseFloat(r.debit  || 0) > 0 ? `Dr: ${fmt(r.debit)}`  : "",
//       parseFloat(r.credit || 0) > 0 ? `Cr: ${fmt(r.credit)}` : "",
//       `Bal: ${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
//     ].filter(Boolean).join("   ");
//     doc.setFont("helvetica", "normal");
//     doc.text(drCrTxt, MARGIN + CONTENT - 6, curY + 13, { align: "right" });
//     doc.setTextColor(0);
//     curY += 20;

//     /* ── Description sub-bar ── */
//     if (r.description) {
//       checkNewPage(14);
//       doc.setFillColor(240, 242, 250);
//       doc.rect(MARGIN, curY, CONTENT, 14, "F");
//       doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 100);
//       doc.text(String(r.description), MARGIN + 6, curY + 10);
//       doc.setTextColor(0);
//       curY += 14;
//     }

//     if (!inv) { curY += 6; return; }

//     const isPayment = type === "Receipt" || type === "Payment";

//     if (isPayment) {
//       /* ── Receipt / Payment detail grid ── */
//       const fields = [
//         ["Party",       inv.party || "—"],
//         ["Date",        inv.receipt_date || inv.payment_date || "—"],
//         ["Amount",      fmt(inv.amount)],
//         ["Method",      inv.method || "—"],
//         ["Reference #", inv.reference_no || "—"],
//         ...(inv.notes       ? [["Notes",       inv.notes]]       : []),
//         ...(inv.description ? [["Description", inv.description]] : []),
//       ];

//       const COLS   = 3;
//       const CELL_W = CONTENT / COLS;
//       const CELL_H = 18;
//       const gridH  = Math.ceil(fields.length / COLS) * CELL_H + 6;
//       checkNewPage(gridH);
//       doc.setFillColor(...tint);
//       doc.rect(MARGIN, curY, CONTENT, gridH, "F");

//       fields.forEach(([label, val], fi) => {
//         const col = fi % COLS;
//         const row = Math.floor(fi / COLS);
//         const cx  = MARGIN + col * CELL_W + 6;
//         const cy  = curY + row * CELL_H + 11;
//         doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
//         doc.text(label.toUpperCase(), cx, cy);
//         doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.setFontSize(8);
//         doc.text(String(val), cx, cy + 8);
//       });
//       curY += gridH + 4;

//     } else {
//       /* ── Invoice / Return items table ── */
//       const items = inv.items || [];
//       if (items.length === 0) { curY += 6; return; }

//       /* party / date info bar */
//       checkNewPage(18);
//       doc.setFillColor(...tint);
//       doc.rect(MARGIN, curY, CONTENT, 18, "F");
//       doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
//       const pLabel = ["Sale Invoice", "Sale Return"].includes(type) ? "Customer" : "Vendor";
//       const pVal   = inv.customer || inv.vendor || "—";
//       const dVal   = inv.invoice_date || inv.return_date || "—";
//       doc.text(`${pLabel}: ${pVal}   |   Date: ${dVal}   |   Total: ${fmt(inv.total_amount)}`, MARGIN + 6, curY + 12);
//       doc.setTextColor(0);
//       curY += 18;

//       const isSaleRet  = type === "Sale Return";
//       const isPurchRet = type === "Purchase Return";

//       const iHead = isSaleRet
//         ? ["#", "Item", "Serial", "Sold Price", "Cost Price"]
//         : isPurchRet
//         ? ["#", "Item", "Serial", "Unit Price"]
//         : ["#", "Item", "Serials", "Qty", "Unit Price", "Total"];

//       const iBody = items.map((it, i) => {
//         const sNum   = it.serial_number || "";
//         const serStr = it.serials
//           ? it.serials.map(s => s.serial + (s.sold_price != null ? ` @${fmt(s.sold_price)}` : "")).join(", ")
//           : sNum;
//         if (isSaleRet)  return [i+1, it.item_name||"", sNum,   fmt(it.sold_price), fmt(it.cost_price)];
//         if (isPurchRet) return [i+1, it.item_name||"", sNum,   fmt(it.unit_price)];
//         return              [i+1, it.item_name||"", serStr, it.qty??0, fmt(it.unit_price), fmt(it.line_total)];
//       });

//       const iColW = isSaleRet
//         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"}, 4:{cellWidth:80,halign:"right"} }
//         : isPurchRet
//         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"} }
//         : { 0:{cellWidth:18}, 1:{cellWidth:130}, 2:{cellWidth:130}, 3:{cellWidth:30,halign:"center"}, 4:{cellWidth:75,halign:"right"}, 5:{cellWidth:75,halign:"right"} };

//       doc.autoTable({
//         head:  [iHead],
//         body:  iBody,
//         startY: curY,
//         margin: { left: MARGIN, right: MARGIN },
//         theme:  "grid",
//         headStyles: { fillColor: acc, textColor: 255, fontSize: 7, fontStyle: "bold", cellPadding: 3 },
//         alternateRowStyles: { fillColor: tint },
//         styles: { fontSize: 7, cellPadding: 3 },
//         columnStyles: iColW,
//         tableWidth: CONTENT,
//       });
//       curY = doc.lastAutoTable.finalY + 4;
//     }

//     /* ── thin separator line ── */
//     checkNewPage(10);
//     doc.setDrawColor(...acc); doc.setLineWidth(0.3);
//     doc.line(MARGIN, curY, MARGIN + CONTENT, curY);
//     curY += 8;
//   });

//   addPageNumbers();
//   doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Detailed.pdf`);
// }

// /* ── CSV ───────────────────────────────────────────────────── */
// function downloadLedger2CSV() {
//   const d = window._ledger2Data;
//   if (!d) return;
//   const lines = [
//     ["Party Ledger", d.partyName],
//     ["Period", `${d.fromDate} to ${d.toDate}`],
//     [],
//     ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
//   ];
//   d.rows.forEach(r => {
//     const inv  = parseInvoiceDetails(r.invoice_details);
//     const type = inv ? (inv.type || "") : "";
//     const bal  = parseFloat(r.running_balance || 0);
//     lines.push([
//       r.entry_date  || "", r.journal_id  || "", type, r.description || "",
//       parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
//       parseFloat(r.credit || 0) > 0 ? r.credit : "",
//       Math.abs(bal).toFixed(2), bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
//     ]);
//   });
//   const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
//   const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
//   const url  = URL.createObjectURL(blob);
//   const a    = document.createElement("a");
//   a.href = url; a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
//   document.body.appendChild(a); a.click(); document.body.removeChild(a);
// }

// /* ── Autocomplete ──────────────────────────────────────────── */
// function initLedger2Autocomplete() {
//   const $input = $("#l2_party_name"), $sugg = $("#l2_suggestions");
//   const url    = "/parties/autocomplete-party";
//   let idx = -1, current = [];

//   $input.on("input", function () {
//     const q = $(this).val(); idx = -1;
//     if (q.length < 1) { $sugg.hide(); return; }
//     $.ajax({ url, data: { term: q }, dataType: "json",
//       success(data) {
//         $sugg.empty(); current = data;
//         if (data.length) {
//           data.forEach((p, i) => $("<div>").addClass("suggestion-item").text(p)
//             .on("mouseenter", function() { $(".suggestion-item").removeClass("highlight"); $(this).addClass("highlight"); idx = i; })
//             .on("click", function() { $input.val(p); $sugg.hide(); })
//             .appendTo($sugg));
//           $sugg.show();
//         } else $sugg.hide();
//       }
//     });
//   });

//   $input.on("keydown", function (e) {
//     const items = $sugg.children(".suggestion-item");
//     if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx+1)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
//     else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx-1+items.length)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
//     else if (e.key === "Enter") {
//       if (current.length===1) { $input.val(current[0]); $sugg.hide(); }
//       else if (idx>=0) { $input.val($(items[idx]).text()); $sugg.hide(); }
//     } else if (e.key === "Escape") $sugg.hide();
//   });

//   $(document).on("click", e => {
//     if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $sugg.hide();
//   });
// }

// /* ── Form ──────────────────────────────────────────────────── */
// function renderLedger2Form() {
//   const today = new Date().toISOString().split("T")[0];
//   const yearStart = `${new Date().getFullYear()}-01-01`;
//   document.getElementById("ledger2-form-area").innerHTML = `
//     <div class="l2-form-row">
//       <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
//         <label class="l2-label" for="l2_party_name">Party Name</label>
//         <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…" autocomplete="off">
//         <div id="l2_suggestions" class="suggestions-dropdown"></div>
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_from_date">From Date</label>
//         <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_to_date">To Date</label>
//         <input type="date" id="l2_to_date" class="l2-input" value="${today}">
//       </div>
//       <div class="l2-field l2-field-btn">
//         <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
//       </div>
//     </div>`;
//   initLedger2Autocomplete();
// }

// /* ── selectReport override (loads after accounts_reports.js) ── */
// function selectReport(type) {
//   $(".report-btn").removeClass("active");
//   const btnMap = {
//     "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
//     "receivable": "btn-receivable", "payable": "btn-payable",
//     "trial": "btn-trial", "ledger2": "btn-ledger2",
//   };
//   if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");

//   document.getElementById("ledger2-section").style.display = type === "ledger2" ? "block" : "none";
//   document.getElementById("classic-section").style.display = type !== "ledger2" ? "block" : "none";

//   if (type === "ledger2") {
//     renderLedger2Form();
//     document.getElementById("ledger2-container").innerHTML =
//       `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
//     return;
//   }

//   const $formSection = $("#report-form-container");
//   $formSection.empty();
//   $("#reportHeader").html("");
//   $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);

//   if      (type === "ledger")      renderLedgerForm();
//   else if (type === "cash-ledger") renderCashLedgerForm();
//   else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
//   else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
//   else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
// }

// $(document).ready(() => selectReport("ledger2"));

// // ============================================================
// //  detailed_ledger2.js  –  Professional Party Ledger Renderer
// // ============================================================

// /* ── colour / label maps ─────────────────────────────────── */
// const TXN_META = {
//   "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"          },
//   "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"      },
//   "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"       },
//   "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"       },
//   "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"   },
//   "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return" },
// };

// function getTxnMeta(type) {
//   return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
// }

// /* ── number formatter ────────────────────────────────────── */
// function fmt(n) {
//   if (n === null || n === undefined || n === "") return "—";
//   const num = parseFloat(n);
//   if (isNaN(num)) return "—";
//   return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// }

// /* ── CSRF ────────────────────────────────────────────────── */
// function getCSRFToken() {
//   const name = "csrftoken=";
//   for (let c of decodeURIComponent(document.cookie).split(";")) {
//     c = c.trim();
//     if (c.startsWith(name)) return c.slice(name.length);
//   }
//   return "";
// }

// /* ── Invoice-detail panel builder ───────────────────────── */
// function buildInvoicePanel(d) {
//   if (!d) return `<span class="no-detail">No invoice details</span>`;

//   const type = d.type || "";
//   const meta = getTxnMeta(type);

//   /* ── helper: serial chips ── */
//   function serialChips(serials) {
//     if (!serials || !serials.length) return "";
//     return serials.map(s => {
//       const comment = s.comment ? `<span class="serial-comment">${escHtml(s.comment)}</span>` : "";
//       const price   = s.sold_price != null
//         ? `<span class="serial-price">@ ${fmt(s.sold_price)}</span>` : "";
//       return `<span class="serial-chip">${escHtml(s.serial)}${price}${comment}</span>`;
//     }).join("");
//   }

//   /* ── helper: item rows ── */
//   function itemRows(items) {
//     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
//     return `
//       <table class="detail-item-table">
//         <thead>
//           <tr>
//             <th>Item</th>
//             <th class="text-right">Qty</th>
//             <th class="text-right">Unit Price</th>
//             <th class="text-right">Line Total</th>
//           </tr>
//         </thead>
//         <tbody>
//           ${items.map(it => `
//             <tr>
//               <td>
//                 <div class="item-name-cell">${escHtml(it.item_name || "")}</div>
//                 <div class="serial-chips">${serialChips(it.serials)}</div>
//               </td>
//               <td class="text-right">${it.qty ?? "—"}</td>
//               <td class="text-right">${fmt(it.unit_price)}</td>
//               <td class="text-right fw-bold">${fmt(it.line_total)}</td>
//             </tr>
//           `).join("")}
//         </tbody>
//       </table>`;
//   }

//   /* ── helper: purchase-return item rows ── */
//   function prItemRows(items) {
//     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
//     return `
//       <table class="detail-item-table">
//         <thead>
//           <tr><th>Item</th><th>Serial</th><th class="text-right">Unit Price</th></tr>
//         </thead>
//         <tbody>
//           ${items.map(it => `
//             <tr>
//               <td>${escHtml(it.item_name || "")}</td>
//               <td><span class="serial-chip">${escHtml(it.serial_number || "")}</span></td>
//               <td class="text-right">${fmt(it.unit_price)}</td>
//             </tr>
//           `).join("")}
//         </tbody>
//       </table>`;
//   }

//   /* ── helper: sale-return item rows ── */
//   function srItemRows(items) {
//     if (!items || !items.length) return `<p class="no-detail">No items</p>`;
//     return `
//       <table class="detail-item-table">
//         <thead>
//           <tr><th>Item</th><th>Serial</th><th class="text-right">Sold Price</th><th class="text-right">Cost Price</th></tr>
//         </thead>
//         <tbody>
//           ${items.map(it => `
//             <tr>
//               <td>${escHtml(it.item_name || "")}</td>
//               <td><span class="serial-chip">${escHtml(it.serial_number || "")}</span></td>
//               <td class="text-right">${fmt(it.sold_price)}</td>
//               <td class="text-right">${fmt(it.cost_price)}</td>
//             </tr>
//           `).join("")}
//         </tbody>
//       </table>`;
//   }

//   /* ── build per-type ── */
//   let header = "", body = "";

//   if (type === "Sale Invoice") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Sale Invoice #${d.sales_invoice_id}</span>
//         <span class="dp-party">${escHtml(d.customer || "")}</span>
//         <span class="dp-date">${d.invoice_date || ""}</span>
//         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
//       </div>`;
//     body = itemRows(d.items);

//   } else if (type === "Purchase Invoice") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Purchase Invoice #${d.purchase_invoice_id}</span>
//         <span class="dp-party">${escHtml(d.vendor || "")}</span>
//         <span class="dp-date">${d.invoice_date || ""}</span>
//         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
//       </div>`;
//     body = itemRows(d.items);

//   } else if (type === "Receipt") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Receipt #${d.receipt_id}</span>
//         <span class="dp-party">${escHtml(d.party || "")}</span>
//         <span class="dp-date">${d.receipt_date || ""}</span>
//         <span class="dp-total">Amount: <strong>${fmt(d.amount)}</strong></span>
//       </div>`;
//     body = `
//       <div class="dp-payment-detail">
//         <div class="dp-row"><span>Method</span><span>${escHtml(d.method || "—")}</span></div>
//         <div class="dp-row"><span>Reference #</span><span>${escHtml(d.reference_no || "—")}</span></div>
//         ${d.notes       ? `<div class="dp-row"><span>Notes</span><span>${escHtml(d.notes)}</span></div>` : ""}
//         ${d.description ? `<div class="dp-row"><span>Description</span><span>${escHtml(d.description)}</span></div>` : ""}
//       </div>`;

//   } else if (type === "Payment") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Payment #${d.payment_id}</span>
//         <span class="dp-party">${escHtml(d.party || "")}</span>
//         <span class="dp-date">${d.payment_date || ""}</span>
//         <span class="dp-total">Amount: <strong>${fmt(d.amount)}</strong></span>
//       </div>`;
//     body = `
//       <div class="dp-payment-detail">
//         <div class="dp-row"><span>Method</span><span>${escHtml(d.method || "—")}</span></div>
//         <div class="dp-row"><span>Reference #</span><span>${escHtml(d.reference_no || "—")}</span></div>
//         ${d.notes       ? `<div class="dp-row"><span>Notes</span><span>${escHtml(d.notes)}</span></div>` : ""}
//         ${d.description ? `<div class="dp-row"><span>Description</span><span>${escHtml(d.description)}</span></div>` : ""}
//       </div>`;

//   } else if (type === "Purchase Return") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Purchase Return #${d.purchase_return_id}</span>
//         <span class="dp-party">${escHtml(d.vendor || "")}</span>
//         <span class="dp-date">${d.return_date || ""}</span>
//         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
//       </div>`;
//     body = prItemRows(d.items);

//   } else if (type === "Sale Return") {
//     header = `
//       <div class="dp-meta">
//         <span class="dp-ref">Sale Return #${d.sales_return_id}</span>
//         <span class="dp-party">${escHtml(d.customer || "")}</span>
//         <span class="dp-date">${d.return_date || ""}</span>
//         <span class="dp-total">Total: <strong>${fmt(d.total_amount)}</strong></span>
//       </div>`;
//     body = srItemRows(d.items);

//   } else {
//     header = `<div class="dp-meta"><span class="dp-ref">${escHtml(type)}</span></div>`;
//     body   = `<pre class="dp-raw">${escHtml(JSON.stringify(d, null, 2))}</pre>`;
//   }

//   return `<div class="detail-panel">${header}${body}</div>`;
// }

// function escHtml(str) {
//   if (str === null || str === undefined) return "";
//   return String(str)
//     .replace(/&/g, "&amp;")
//     .replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;")
//     .replace(/"/g, "&quot;");
// }

// /* ── Main render ─────────────────────────────────────────── */
// function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
//   const container = document.getElementById("ledger2-container");
//   if (!container) return;

//   if (!rows || rows.length === 0) {
//     container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
//     return;
//   }

//   /* running totals */
//   let totalDebit = 0, totalCredit = 0;
//   rows.forEach(r => {
//     totalDebit  += parseFloat(r.debit  || 0);
//     totalCredit += parseFloat(r.credit || 0);
//   });
//   const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);

//   /* group by month for visual separators */
//   let lastMonth = null;

//   const rowsHtml = rows.map((r, idx) => {
//     const d     = r.invoice_details;
//     const type  = d ? (d.type || "") : "";
//     const meta  = getTxnMeta(type);
//     const bal   = parseFloat(r.running_balance || 0);
//     const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
//     const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";

//     /* month separator */
//     const rowDate  = r.entry_date ? r.entry_date.slice(0, 7) : "";
//     let separator  = "";
//     if (rowDate !== lastMonth) {
//       lastMonth = rowDate;
//       const monthLabel = r.entry_date
//         ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
//         : "";
//       separator = `<tr class="month-sep-row"><td colspan="9"><span class="month-sep-label">${monthLabel}</span></td></tr>`;
//     }

//     const hasDetail = !!d;
//     const detailId  = `detail-${idx}`;

//     return `${separator}
//     <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
//       <td class="col-date">${r.entry_date || "—"}</td>
//       <td class="col-jid">${r.journal_id || "—"}</td>
//       <td class="col-type">
//         <span class="txn-badge ${meta.badge}">
//           <span class="txn-icon">${meta.icon}</span>${meta.label}
//         </span>
//       </td>
//       <td class="col-desc">${escHtml(r.description || "")}</td>
//       <td class="col-debit text-right">${parseFloat(r.debit || 0) > 0 ? fmt(r.debit) : ""}</td>
//       <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
//       <td class="col-bal text-right">
//         <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
//         ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
//       </td>
//       <td class="col-toggle">
//         ${hasDetail
//           ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
//                <span class="expand-icon">▼</span>
//              </button>`
//           : ""}
//       </td>
//     </tr>
//     ${hasDetail ? `
//     <tr class="detail-row" id="${detailId}" style="display:none;">
//       <td colspan="9" class="detail-cell">
//         ${buildInvoicePanel(d)}
//       </td>
//     </tr>` : ""}`;
//   }).join("");

//   const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
//   const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)" : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";

//   container.innerHTML = `
//     <div class="ledger2-header-bar">
//       <div class="ledger2-party-info">
//         <span class="ledger2-party-name">${escHtml(partyName)}</span>
//         <span class="ledger2-period">${fromDate} → ${toDate}</span>
//       </div>
//       <div class="ledger2-summary-chips">
//         <div class="summary-chip chip-debit">
//           <span class="chip-label">Total Debit</span>
//           <span class="chip-value">${fmt(totalDebit)}</span>
//         </div>
//         <div class="summary-chip chip-credit">
//           <span class="chip-label">Total Credit</span>
//           <span class="chip-value">${fmt(totalCredit)}</span>
//         </div>
//         <div class="summary-chip chip-balance ${closingClass}">
//           <span class="chip-label">Closing Balance</span>
//           <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
//           <span class="chip-sub">${closingLabel}</span>
//         </div>
//       </div>
//     </div>

//     <div class="ledger2-table-wrap">
//       <table class="ledger2-table" id="ledger2Table">
//         <thead>
//           <tr>
//             <th class="col-date">Date</th>
//             <th class="col-jid">J#</th>
//             <th class="col-type">Type</th>
//             <th class="col-desc">Description</th>
//             <th class="col-debit text-right">Debit</th>
//             <th class="col-credit text-right">Credit</th>
//             <th class="col-bal text-right">Balance</th>
//             <th class="col-toggle"></th>
//           </tr>
//         </thead>
//         <tbody>
//           ${rowsHtml}
//         </tbody>
//         <tfoot>
//           <tr class="ledger2-foot">
//             <td colspan="4" class="foot-label">Totals</td>
//             <td class="text-right foot-total">${fmt(totalDebit)}</td>
//             <td class="text-right foot-total">${fmt(totalCredit)}</td>
//             <td colspan="2" class="text-right foot-balance ${closingClass}">
//               ${fmt(Math.abs(closingBal))}
//               <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
//             </td>
//           </tr>
//         </tfoot>
//       </table>
//     </div>

//     <div class="ledger2-actions">
//       <button class="l2-btn l2-btn-pdf" onclick="downloadLedger2PDF()">📄 Download PDF</button>
//       <button class="l2-btn l2-btn-csv" onclick="downloadLedger2CSV()">📊 Download CSV</button>
//       <button class="l2-btn l2-btn-expand" onclick="expandAllDetails()">⊞ Expand All</button>
//       <button class="l2-btn l2-btn-collapse" onclick="collapseAllDetails()">⊟ Collapse All</button>
//     </div>
//   `;

//   /* store for PDF/CSV */
//   window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
// }

// /* ── toggle single row ───────────────────────────────────── */
// function toggleDetail(id, btn) {
//   const row = document.getElementById(id);
//   if (!row) return;
//   const isHidden = row.style.display === "none";
//   row.style.display = isHidden ? "table-row" : "none";
//   const icon = btn.querySelector(".expand-icon");
//   if (icon) icon.textContent = isHidden ? "▲" : "▼";
//   btn.classList.toggle("expanded", isHidden);
// }

// function expandAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.add("expanded");
//     const ic = b.querySelector(".expand-icon");
//     if (ic) ic.textContent = "▲";
//   });
// }

// function collapseAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.remove("expanded");
//     const ic = b.querySelector(".expand-icon");
//     if (ic) ic.textContent = "▼";
//   });
// }

// /* ── Fetch ───────────────────────────────────────────────── */
// function fetchDetailedLedger2() {
//   const partyName = document.getElementById("l2_party_name").value.trim();
//   const fromDate  = document.getElementById("l2_from_date").value;
//   const toDate    = document.getElementById("l2_to_date").value;

//   if (!partyName || !fromDate || !toDate) {
//     Swal.fire("Missing Fields", "Please fill in all fields.", "warning");
//     return;
//   }

//   Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

//   fetch("/accountsReports/detailed-ledger2/", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
//   })
//     .then(res => res.json())
//     .then(data => {
//       Swal.close();
//       if (data.error) { Swal.fire("Error", data.error, "error"); return; }
//       renderDetailedLedger2(data, partyName, fromDate, toDate);
//     })
//     .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
// }

// /* ── PDF download ────────────────────────────────────────── */
// function downloadLedger2PDF() {
//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF("l", "pt", "a4");  // landscape for more columns
//   const d   = window._ledger2Data;
//   if (!d) return;

//   doc.setFontSize(14);
//   doc.text(`Party Ledger — ${d.partyName}`, 40, 36);
//   doc.setFontSize(9);
//   doc.text(`Period: ${d.fromDate}  to  ${d.toDate}`, 40, 52);
//   doc.text(`Total Debit: ${fmt(d.totalDebit)}   Total Credit: ${fmt(d.totalCredit)}   Closing Balance: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`, 40, 66);

//   const tableRows = d.rows.map(r => {
//     const type = r.invoice_details ? (r.invoice_details.type || "") : "";
//     const bal  = parseFloat(r.running_balance || 0);
//     return [
//       r.entry_date || "",
//       r.journal_id || "",
//       type,
//       r.description || "",
//       parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
//       parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
//       `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
//     ];
//   });

//   doc.autoTable({
//     head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
//     body: tableRows,
//     startY: 82,
//     theme: "grid",
//     headStyles: { fillColor: [30, 80, 160], fontSize: 8 },
//     styles: { fontSize: 7.5 },
//     columnStyles: {
//       0: { cellWidth: 65 },
//       1: { cellWidth: 35 },
//       2: { cellWidth: 75 },
//       3: { cellWidth: 200 },
//       4: { cellWidth: 65, halign: "right" },
//       5: { cellWidth: 65, halign: "right" },
//       6: { cellWidth: 70, halign: "right" },
//     },
//   });

//   const total = doc.internal.getNumberOfPages();
//   for (let i = 1; i <= total; i++) {
//     doc.setPage(i);
//     doc.setFontSize(7);
//     doc.text(`Page ${i} of ${total}`, doc.internal.pageSize.width - 60, doc.internal.pageSize.height - 15);
//   }

//   doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}.pdf`);
// }

// /* ── CSV download ────────────────────────────────────────── */
// function downloadLedger2CSV() {
//   const d = window._ledger2Data;
//   if (!d) return;

//   const lines = [
//     [`Party Ledger`, d.partyName],
//     [`Period`, `${d.fromDate} to ${d.toDate}`],
//     [],
//     ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
//   ];

//   d.rows.forEach(r => {
//     const type = r.invoice_details ? (r.invoice_details.type || "") : "";
//     const bal  = parseFloat(r.running_balance || 0);
//     lines.push([
//       r.entry_date   || "",
//       r.journal_id   || "",
//       type,
//       r.description  || "",
//       parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
//       parseFloat(r.credit || 0) > 0 ? r.credit : "",
//       Math.abs(bal).toFixed(2),
//       bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
//     ]);
//   });

//   const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
//   const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
//   const url  = URL.createObjectURL(blob);
//   const a    = document.createElement("a");
//   a.href     = url;
//   a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);
// }

// /* ── Autocomplete (reuse existing initAutocomplete if available) ── */
// function initLedger2Autocomplete() {
//   const $input       = $("#l2_party_name");
//   const $suggestions = $("#l2_suggestions");
//   const url          = "/parties/autocomplete-party";
//   let selectedIndex  = -1, currentSuggestions = [];

//   $input.on("input", function () {
//     const q = $(this).val();
//     selectedIndex = -1;
//     if (q.length < 1) { $suggestions.hide(); return; }
//     $.ajax({
//       url, data: { term: q }, dataType: "json",
//       success(data) {
//         $suggestions.empty();
//         currentSuggestions = data;
//         if (data.length > 0) {
//           data.forEach((party, i) => {
//             $("<div>").addClass("suggestion-item").text(party)
//               .on("mouseenter", function() {
//                 $(".suggestion-item").removeClass("highlight");
//                 $(this).addClass("highlight"); selectedIndex = i;
//               })
//               .on("click", function() { $input.val(party); $suggestions.hide(); })
//               .appendTo($suggestions);
//           });
//           $suggestions.show();
//         } else { $suggestions.hide(); }
//       },
//     });
//   });

//   $input.on("keydown", function (e) {
//     const items = $suggestions.children(".suggestion-item");
//     if (e.key === "ArrowDown") {
//       e.preventDefault();
//       selectedIndex = (selectedIndex + 1) % items.length;
//       items.removeClass("highlight"); $(items[selectedIndex]).addClass("highlight");
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault();
//       selectedIndex = (selectedIndex - 1 + items.length) % items.length;
//       items.removeClass("highlight"); $(items[selectedIndex]).addClass("highlight");
//     } else if (e.key === "Enter") {
//       if (currentSuggestions.length === 1) { $input.val(currentSuggestions[0]); $suggestions.hide(); }
//       else if (selectedIndex >= 0) { $input.val($(items[selectedIndex]).text()); $suggestions.hide(); }
//     } else if (e.key === "Escape") { $suggestions.hide(); }
//   });

//   $(document).on("click", function (e) {
//     if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $suggestions.hide();
//   });
// }

// /* ── Mount form into the existing report system ──────────── */
// function renderLedger2Form() {
//   const today    = new Date().toISOString().split("T")[0];
//   const yearStart = `${new Date().getFullYear()}-01-01`;

//   document.getElementById("ledger2-form-area").innerHTML = `
//     <div class="l2-form-row">
//       <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
//         <label class="l2-label" for="l2_party_name">Party Name</label>
//         <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…"
//                autocomplete="off">
//         <div id="l2_suggestions" class="suggestions-dropdown"></div>
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_from_date">From Date</label>
//         <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_to_date">To Date</label>
//         <input type="date" id="l2_to_date" class="l2-input" value="${today}">
//       </div>
//       <div class="l2-field l2-field-btn">
//         <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
//       </div>
//     </div>
//   `;
//   initLedger2Autocomplete();
// }

// /* ── Called from selectReport() in accounts_reports.js ────── */
// function selectReport(type) {
//   $(".report-btn").removeClass("active");
//   const btnMap = {
//     "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
//     "receivable": "btn-receivable", "payable": "btn-payable",
//     "trial": "btn-trial", "ledger2": "btn-ledger2",
//   };
//   if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");

//   /* hide/show sections */
//   document.getElementById("ledger2-section").style.display  = type === "ledger2" ? "block" : "none";
//   document.getElementById("classic-section").style.display  = type !== "ledger2" ? "block" : "none";

//   if (type === "ledger2") {
//     renderLedger2Form();
//     document.getElementById("ledger2-container").innerHTML =
//       `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
//     return;
//   }

//   /* delegate to original handler for other reports */
//   const $formSection = $("#report-form-container");
//   $formSection.empty();
//   $("#reportHeader").html("");
//   $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);

//   if      (type === "ledger")      renderLedgerForm();
//   else if (type === "cash-ledger") renderCashLedgerForm();
//   else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
//   else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
//   else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
// }

// $(document).ready(() => selectReport("ledger2"));



// // ================================================================
// //  detailed_ledger2.js  –  Professional Party Ledger  (v2)
// // ================================================================
 
// /* ── Transaction metadata ─────────────────────────────────── */
// const TXN_META = {
//   "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"           },
//   "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"       },
//   "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"        },
//   "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"        },
//   "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"    },
//   "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return"  },
// };
// function getTxnMeta(type) {
//   return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
// }
 
// /* ── Number formatter ─────────────────────────────────────── */
// function fmt(n) {
//   if (n === null || n === undefined || n === "") return "—";
//   const num = parseFloat(n);
//   if (isNaN(num)) return "—";
//   return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// }
 
// function escHtml(str) {
//   if (str === null || str === undefined) return "";
//   return String(str)
//     .replace(/&/g, "&amp;").replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// }
 
// /* ─────────────────────────────────────────────────────────────
//    CRITICAL FIX: invoice_details can arrive as a JSON string
//    from Django – always normalise to a plain object.
// ───────────────────────────────────────────────────────────── */
// function parseInvoiceDetails(raw) {
//   if (!raw) return null;
//   if (typeof raw === "object") return raw;
//   if (typeof raw === "string") {
//     try { return JSON.parse(raw); } catch { return null; }
//   }
//   return null;
// }
 
// function getCSRFToken() {
//   const name = "csrftoken=";
//   for (let c of decodeURIComponent(document.cookie).split(";")) {
//     c = c.trim();
//     if (c.startsWith(name)) return c.slice(name.length);
//   }
//   return "";
// }
 
// /* ================================================================
//    DETAIL PANEL BUILDER  —  polished card rendered in the DOM
// ================================================================ */
// function buildInvoicePanel(rawDetail) {
//   const d = parseInvoiceDetails(rawDetail);
//   if (!d) return `<div class="dp-empty">No detail available for this entry.</div>`;
 
//   const type = d.type || "";
//   const meta = getTxnMeta(type);
 
//   /* ── Serial chips ── */
//   function serialChips(serials) {
//     if (!serials || !serials.length) return '<span class="dp-none">—</span>';
//     return `<div class="dp-serial-list">${serials.map(s => {
//       const price   = s.sold_price != null ? `<span class="dps-price">${fmt(s.sold_price)}</span>` : "";
//       const comment = s.comment ? `<span class="dps-comment">${escHtml(s.comment)}</span>` : "";
//       return `<span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(s.serial)}</span>${price}${comment}</span>`;
//     }).join("")}</div>`;
//   }
 
//   /* ── Items table for invoices ── */
//   function invoiceItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     const rows = items.map((it, i) => `
//       <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//         <td class="dp-td dp-td-num">${i + 1}</td>
//         <td class="dp-td">
//           <div class="dp-item-name">${escHtml(it.item_name || "")}</div>
//           ${it.serials ? serialChips(it.serials) : ""}
//         </td>
//         <td class="dp-td dp-td-r">${it.qty ?? "—"}</td>
//         <td class="dp-td dp-td-r">${fmt(it.unit_price)}</td>
//         <td class="dp-td dp-td-r dp-td-total">${fmt(it.line_total)}</td>
//       </tr>`).join("");
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item &amp; Serials</th>
//           <th class="dp-th dp-th-r">Qty</th>
//           <th class="dp-th dp-th-r">Unit Price</th>
//           <th class="dp-th dp-th-r">Total</th>
//         </tr></thead>
//         <tbody>${rows}</tbody>
//         <tfoot><tr>
//           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }
 
//   /* ── Items table for Purchase Return ── */
//   function prItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item</th>
//           <th class="dp-th">Serial Number</th>
//           <th class="dp-th dp-th-r">Unit Price</th>
//         </tr></thead>
//         <tbody>${items.map((it, i) => `
//           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//             <td class="dp-td dp-td-num">${i + 1}</td>
//             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
//             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
//             <td class="dp-td dp-td-r dp-td-total">${fmt(it.unit_price)}</td>
//           </tr>`).join("")}
//         </tbody>
//         <tfoot><tr>
//           <td colspan="3" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }
 
//   /* ── Items table for Sale Return ── */
//   function srItemsTable(items) {
//     if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
//     return `
//       <table class="dp-items-table">
//         <thead><tr>
//           <th class="dp-th dp-th-num">#</th>
//           <th class="dp-th">Item</th>
//           <th class="dp-th">Serial Number</th>
//           <th class="dp-th dp-th-r">Sold Price</th>
//           <th class="dp-th dp-th-r">Cost Price</th>
//         </tr></thead>
//         <tbody>${items.map((it, i) => `
//           <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
//             <td class="dp-td dp-td-num">${i + 1}</td>
//             <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
//             <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
//             <td class="dp-td dp-td-r">${fmt(it.sold_price)}</td>
//             <td class="dp-td dp-td-r dp-td-total">${fmt(it.cost_price)}</td>
//           </tr>`).join("")}
//         </tbody>
//         <tfoot><tr>
//           <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
//           <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
//         </tr></tfoot>
//       </table>`;
//   }
 
//   /* ── Payment / Receipt field grid ── */
//   function paymentCard(fields) {
//     const visible = fields.filter(([, v]) => v !== null && v !== undefined && v !== "");
//     return `<div class="dp-pay-grid">
//       ${visible.map(([label, val]) => `
//         <div class="dp-pay-row">
//           <span class="dp-pay-label">${label}</span>
//           <span class="dp-pay-val">${escHtml(String(val))}</span>
//         </div>`).join("")}
//     </div>`;
//   }
 
//   /* ── Top strip shared across all types ── */
//   function topStrip(refLabel, refNum, partyLabel, partyVal, dateVal, amtLabel, amtVal) {
//     return `
//       <div class="dp-top-strip dp-strip-${meta.badge}">
//         <div class="dp-strip-left">
//           <span class="dp-strip-badge ${meta.badge}">${meta.icon} ${meta.label}</span>
//           <span class="dp-strip-ref">${refLabel} <strong>#${refNum}</strong></span>
//         </div>
//         <div class="dp-strip-mid">
//           <span class="dp-strip-field">
//             <span class="dp-sf-label">${partyLabel}</span>
//             <span class="dp-sf-val">${escHtml(partyVal || "—")}</span>
//           </span>
//           <span class="dp-strip-field">
//             <span class="dp-sf-label">Date</span>
//             <span class="dp-sf-val">${dateVal || "—"}</span>
//           </span>
//         </div>
//         <div class="dp-strip-right">
//           <span class="dp-sf-label">${amtLabel}</span>
//           <span class="dp-strip-amount">${fmt(amtVal)}</span>
//         </div>
//       </div>`;
//   }
 
//   /* ── Dispatch by type ── */
//   if (type === "Sale Invoice") {
//     return topStrip("Invoice", d.sales_invoice_id, "Customer", d.customer, d.invoice_date, "Total", d.total_amount)
//          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;
 
//   } else if (type === "Purchase Invoice") {
//     return topStrip("Invoice", d.purchase_invoice_id, "Vendor", d.vendor, d.invoice_date, "Total", d.total_amount)
//          + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;
 
//   } else if (type === "Receipt") {
//     return topStrip("Receipt", d.receipt_id, "Party", d.party, d.receipt_date, "Amount", d.amount)
//          + `<div class="dp-body">${paymentCard([
//               ["Method",      d.method],
//               ["Reference #", d.reference_no],
//               ["Notes",       d.notes],
//               ["Description", d.description],
//             ])}</div>`;
 
//   } else if (type === "Payment") {
//     return topStrip("Payment", d.payment_id, "Party", d.party, d.payment_date, "Amount", d.amount)
//          + `<div class="dp-body">${paymentCard([
//               ["Method",      d.method],
//               ["Reference #", d.reference_no],
//               ["Notes",       d.notes],
//               ["Description", d.description],
//             ])}</div>`;
 
//   } else if (type === "Purchase Return") {
//     return topStrip("Return", d.purchase_return_id, "Vendor", d.vendor, d.return_date, "Total", d.total_amount)
//          + `<div class="dp-body">${prItemsTable(d.items)}</div>`;
 
//   } else if (type === "Sale Return") {
//     return topStrip("Return", d.sales_return_id, "Customer", d.customer, d.return_date, "Total", d.total_amount)
//          + `<div class="dp-body">${srItemsTable(d.items)}</div>`;
 
//   } else {
//     return `<div class="dp-empty">Unknown transaction type: ${escHtml(type)}</div>`;
//   }
// }
 
// /* ================================================================
//    MAIN TABLE RENDERER
// ================================================================ */
// function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
//   const container = document.getElementById("ledger2-container");
//   if (!container) return;
 
//   if (!rows || rows.length === 0) {
//     container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
//     return;
//   }
 
//   let totalDebit = 0, totalCredit = 0;
//   rows.forEach(r => {
//     totalDebit  += parseFloat(r.debit  || 0);
//     totalCredit += parseFloat(r.credit || 0);
//   });
//   const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);
 
//   let lastMonth = null;
 
//   const rowsHtml = rows.map((r, idx) => {
//     const d    = parseInvoiceDetails(r.invoice_details);
//     const type = d ? (d.type || "") : "";
//     const meta = getTxnMeta(type);
//     const bal  = parseFloat(r.running_balance || 0);
//     const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
//     const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";
 
//     const rowMonth = r.entry_date ? r.entry_date.slice(0, 7) : "";
//     let separator  = "";
//     if (rowMonth !== lastMonth) {
//       lastMonth = rowMonth;
//       const monthLabel = r.entry_date
//         ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
//         : "";
//       separator = `<tr class="month-sep-row"><td colspan="9"><span class="month-sep-label">📅 ${monthLabel}</span></td></tr>`;
//     }
 
//     const hasDetail = !!d;
//     const detailId  = `detail-${idx}`;
 
//     return `${separator}
//     <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
//       <td class="col-date">${r.entry_date || "—"}</td>
//       <td class="col-jid">${r.journal_id || "—"}</td>
//       <td class="col-type">
//         <span class="txn-badge ${meta.badge}">
//           <span class="txn-icon">${meta.icon}</span>${meta.label}
//         </span>
//       </td>
//       <td class="col-desc">${escHtml(r.description || "")}</td>
//       <td class="col-debit  text-right">${parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : ""}</td>
//       <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
//       <td class="col-bal text-right">
//         <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
//         ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
//       </td>
//       <td class="col-toggle">
//         ${hasDetail
//           ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
//                <span class="expand-icon">▼</span>
//              </button>`
//           : ""}
//       </td>
//     </tr>
//     ${hasDetail ? `
//     <tr class="detail-row" id="${detailId}" style="display:none;">
//       <td colspan="8" class="detail-cell">
//         <div class="detail-panel-wrap">
//           ${buildInvoicePanel(r.invoice_details)}
//         </div>
//       </td>
//     </tr>` : ""}`;
//   }).join("");
 
//   const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
//   const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)"
//                      : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";
 
//   container.innerHTML = `
//     <div class="ledger2-header-bar">
//       <div class="ledger2-party-info">
//         <span class="ledger2-party-name">${escHtml(partyName)}</span>
//         <span class="ledger2-period">${fromDate} → ${toDate}</span>
//       </div>
//       <div class="ledger2-summary-chips">
//         <div class="summary-chip chip-debit">
//           <span class="chip-label">Total Debit</span>
//           <span class="chip-value">${fmt(totalDebit)}</span>
//         </div>
//         <div class="summary-chip chip-credit">
//           <span class="chip-label">Total Credit</span>
//           <span class="chip-value">${fmt(totalCredit)}</span>
//         </div>
//         <div class="summary-chip chip-balance ${closingClass}">
//           <span class="chip-label">Closing Balance</span>
//           <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
//           <span class="chip-sub">${closingLabel}</span>
//         </div>
//       </div>
//     </div>
 
//     <div class="ledger2-table-wrap">
//       <table class="ledger2-table" id="ledger2Table">
//         <thead>
//           <tr>
//             <th class="col-date">Date</th>
//             <th class="col-jid">J#</th>
//             <th class="col-type">Type</th>
//             <th class="col-desc">Description</th>
//             <th class="col-debit  text-right">Debit</th>
//             <th class="col-credit text-right">Credit</th>
//             <th class="col-bal   text-right">Balance</th>
//             <th class="col-toggle"></th>
//           </tr>
//         </thead>
//         <tbody>${rowsHtml}</tbody>
//         <tfoot>
//           <tr class="ledger2-foot">
//             <td colspan="4" class="foot-label">Totals</td>
//             <td class="text-right foot-total">${fmt(totalDebit)}</td>
//             <td class="text-right foot-total">${fmt(totalCredit)}</td>
//             <td colspan="2" class="text-right foot-balance ${closingClass}">
//               ${fmt(Math.abs(closingBal))}
//               <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
//             </td>
//           </tr>
//         </tfoot>
//       </table>
//     </div>
 
//     <div class="ledger2-actions">
//       <button class="l2-btn l2-btn-pdf"     onclick="downloadLedger2PDF(false)">📄 PDF — Summary</button>
//       <button class="l2-btn l2-btn-pdf-det" onclick="downloadLedger2PDF(true)">📋 PDF — With Details</button>
//       <button class="l2-btn l2-btn-csv"     onclick="downloadLedger2CSV()">📊 Download CSV</button>
//       <button class="l2-btn l2-btn-expand"  onclick="expandAllDetails()">⊞ Expand All</button>
//       <button class="l2-btn l2-btn-collapse"onclick="collapseAllDetails()">⊟ Collapse All</button>
//     </div>`;
 
//   window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
// }
 
// /* ── Toggle expand ─────────────────────────────────────────── */
// function toggleDetail(id, btn) {
//   const row = document.getElementById(id);
//   if (!row) return;
//   const isHidden = row.style.display === "none";
//   row.style.display = isHidden ? "table-row" : "none";
//   const icon = btn.querySelector(".expand-icon");
//   if (icon) icon.textContent = isHidden ? "▲" : "▼";
//   btn.classList.toggle("expanded", isHidden);
// }
 
// function expandAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.add("expanded");
//     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▲";
//   });
// }
 
// function collapseAllDetails() {
//   document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
//   document.querySelectorAll(".expand-btn").forEach(b => {
//     b.classList.remove("expanded");
//     const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▼";
//   });
// }
 
// /* ── Fetch ─────────────────────────────────────────────────── */
// function fetchDetailedLedger2() {
//   const partyName = document.getElementById("l2_party_name").value.trim();
//   const fromDate  = document.getElementById("l2_from_date").value;
//   const toDate    = document.getElementById("l2_to_date").value;
 
//   if (!partyName || !fromDate || !toDate) {
//     Swal.fire("Missing Fields", "Please fill in all fields.", "warning"); return;
//   }
 
//   Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });
 
//   fetch("/accountsReports/detailed-ledger2/", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
//   })
//     .then(res => res.json())
//     .then(data => {
//       Swal.close();
//       if (data.error) { Swal.fire("Error", data.error, "error"); return; }
//       renderDetailedLedger2(data, partyName, fromDate, toDate);
//     })
//     .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
// }
 
// /* ================================================================
//    PDF  —  two modes
//    downloadLedger2PDF(false)  →  Summary (landscape, table only)
//    downloadLedger2PDF(true)   →  Detailed (portrait, per-row cards)
// ================================================================ */
// function downloadLedger2PDF(withDetails) {
//   const { jsPDF } = window.jspdf;
//   const d = window._ledger2Data;
//   if (!d) { Swal.fire("No Data", "Generate the ledger first.", "warning"); return; }
 
//   const orientation = withDetails ? "p" : "l";
//   const doc  = new jsPDF(orientation, "pt", "a4");
//   const pageW = doc.internal.pageSize.width;
//   const pageH = doc.internal.pageSize.height;
 
//   /* ── shared page header ── */
//   function drawPageHeader() {
//     doc.setFillColor(30, 58, 128);
//     doc.rect(0, 0, pageW, 52, "F");
//     doc.setTextColor(255, 255, 255);
//     doc.setFontSize(14); doc.setFont("helvetica", "bold");
//     doc.text(`Party Ledger  —  ${d.partyName}`, 18, 22);
//     doc.setFontSize(8); doc.setFont("helvetica", "normal");
//     doc.text(`Period: ${d.fromDate}  →  ${d.toDate}`, 18, 37);
//     const sumTxt = `Total Debit: ${fmt(d.totalDebit)}    Total Credit: ${fmt(d.totalCredit)}    Closing: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`;
//     doc.text(sumTxt, pageW - 18, 37, { align: "right" });
//     doc.setTextColor(0);
//   }
 
//   function addPageNumbers() {
//     const total = doc.internal.getNumberOfPages();
//     for (let i = 1; i <= total; i++) {
//       doc.setPage(i);
//       doc.setFontSize(7); doc.setTextColor(140);
//       doc.text(`Page ${i} of ${total}`, pageW - 18, pageH - 12, { align: "right" });
//       doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, 18, pageH - 12);
//       doc.setTextColor(0);
//     }
//   }
 
//   /* ══════════════════════════════════
//      MODE A — Summary (landscape)
//   ══════════════════════════════════ */
//   if (!withDetails) {
//     drawPageHeader();
 
//     const tableRows = d.rows.map(r => {
//       const inv  = parseInvoiceDetails(r.invoice_details);
//       const type = inv ? (inv.type || "") : "";
//       const bal  = parseFloat(r.running_balance || 0);
//       return [
//         r.entry_date  || "",
//         String(r.journal_id || ""),
//         type,
//         r.description || "",
//         parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
//         parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
//         `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
//       ];
//     });
 
//     doc.autoTable({
//       head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
//       body: tableRows,
//       startY: 60,
//       theme: "grid",
//       headStyles: { fillColor: [30, 80, 160], textColor: 255, fontSize: 8, fontStyle: "bold" },
//       alternateRowStyles: { fillColor: [245, 247, 253] },
//       styles: { fontSize: 7.5, cellPadding: 4 },
//       columnStyles: {
//         0: { cellWidth: 62 }, 1: { cellWidth: 32, halign: "center" },
//         2: { cellWidth: 82 }, 3: { cellWidth: 230 },
//         4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 72, halign: "right" },
//         6: { cellWidth: 80, halign: "right" },
//       },
//       foot: [["", "", "", "TOTALS",
//         fmt(d.totalDebit), fmt(d.totalCredit),
//         `${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`]],
//       footStyles: { fillColor: [30, 58, 128], textColor: 255, fontStyle: "bold", fontSize: 8 },
//     });
 
//     addPageNumbers();
//     doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Summary.pdf`);
//     return;
//   }
 
//   /* ══════════════════════════════════════════
//      MODE B — Detailed (portrait A4)
//      Each ledger row renders as a colour-coded
//      card with its full invoice detail below.
//   ══════════════════════════════════════════ */
//   const MARGIN  = 18;
//   const CONTENT = pageW - MARGIN * 2;
 
//   const TYPE_TINT = {
//     "Sale Invoice":     [232, 244, 255], "Purchase Invoice": [243, 240, 255],
//     "Receipt":          [232, 255, 242], "Payment":          [255, 243, 232],
//     "Sale Return":      [255, 251, 224], "Purchase Return":  [232, 240, 255],
//   };
//   const TYPE_ACCENT = {
//     "Sale Invoice":     [21, 101, 192], "Purchase Invoice": [91,  33, 182],
//     "Receipt":          [21, 127,  75], "Payment":          [194, 65,  12],
//     "Sale Return":      [180, 83,   9], "Purchase Return":  [30,  64, 175],
//   };
 
//   drawPageHeader();
//   let curY = 60;
 
//   function checkNewPage(needed) {
//     if (curY + needed > pageH - 28) {
//       doc.addPage();
//       curY = 18;
//     }
//   }
 
//   d.rows.forEach(r => {
//     const inv   = parseInvoiceDetails(r.invoice_details);
//     const type  = inv ? (inv.type || "") : "";
//     const meta  = getTxnMeta(type);
//     const bal   = parseFloat(r.running_balance || 0);
//     const tint  = TYPE_TINT[type]   || [245, 245, 245];
//     const acc   = TYPE_ACCENT[type] || [80, 80, 80];
 
//     /* ── Accent header bar ── */
//     checkNewPage(22);
//     doc.setFillColor(...acc);
//     doc.rect(MARGIN, curY, CONTENT, 20, "F");
//     doc.setTextColor(255);
//     doc.setFontSize(8); doc.setFont("helvetica", "bold");
//     doc.text(`${meta.icon}  ${type}   |   J# ${r.journal_id || ""}   |   ${r.entry_date || ""}`, MARGIN + 6, curY + 13);
 
//     const drCrTxt = [
//       parseFloat(r.debit  || 0) > 0 ? `Dr: ${fmt(r.debit)}`  : "",
//       parseFloat(r.credit || 0) > 0 ? `Cr: ${fmt(r.credit)}` : "",
//       `Bal: ${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
//     ].filter(Boolean).join("   ");
//     doc.setFont("helvetica", "normal");
//     doc.text(drCrTxt, MARGIN + CONTENT - 6, curY + 13, { align: "right" });
//     doc.setTextColor(0);
//     curY += 20;
 
//     /* ── Description sub-bar ── */
//     if (r.description) {
//       checkNewPage(14);
//       doc.setFillColor(240, 242, 250);
//       doc.rect(MARGIN, curY, CONTENT, 14, "F");
//       doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 100);
//       doc.text(String(r.description), MARGIN + 6, curY + 10);
//       doc.setTextColor(0);
//       curY += 14;
//     }
 
//     if (!inv) { curY += 6; return; }
 
//     const isPayment = type === "Receipt" || type === "Payment";
 
//     if (isPayment) {
//       /* ── Receipt / Payment detail grid ── */
//       const fields = [
//         ["Party",       inv.party || "—"],
//         ["Date",        inv.receipt_date || inv.payment_date || "—"],
//         ["Amount",      fmt(inv.amount)],
//         ["Method",      inv.method || "—"],
//         ["Reference #", inv.reference_no || "—"],
//         ...(inv.notes       ? [["Notes",       inv.notes]]       : []),
//         ...(inv.description ? [["Description", inv.description]] : []),
//       ];
 
//       const COLS   = 3;
//       const CELL_W = CONTENT / COLS;
//       const CELL_H = 18;
//       const gridH  = Math.ceil(fields.length / COLS) * CELL_H + 6;
//       checkNewPage(gridH);
//       doc.setFillColor(...tint);
//       doc.rect(MARGIN, curY, CONTENT, gridH, "F");
 
//       fields.forEach(([label, val], fi) => {
//         const col = fi % COLS;
//         const row = Math.floor(fi / COLS);
//         const cx  = MARGIN + col * CELL_W + 6;
//         const cy  = curY + row * CELL_H + 11;
//         doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
//         doc.text(label.toUpperCase(), cx, cy);
//         doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.setFontSize(8);
//         doc.text(String(val), cx, cy + 8);
//       });
//       curY += gridH + 4;
 
//     } else {
//       /* ── Invoice / Return items table ── */
//       const items = inv.items || [];
//       if (items.length === 0) { curY += 6; return; }
 
//       /* party / date info bar */
//       checkNewPage(18);
//       doc.setFillColor(...tint);
//       doc.rect(MARGIN, curY, CONTENT, 18, "F");
//       doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
//       const pLabel = ["Sale Invoice", "Sale Return"].includes(type) ? "Customer" : "Vendor";
//       const pVal   = inv.customer || inv.vendor || "—";
//       const dVal   = inv.invoice_date || inv.return_date || "—";
//       doc.text(`${pLabel}: ${pVal}   |   Date: ${dVal}   |   Total: ${fmt(inv.total_amount)}`, MARGIN + 6, curY + 12);
//       doc.setTextColor(0);
//       curY += 18;
 
//       const isSaleRet  = type === "Sale Return";
//       const isPurchRet = type === "Purchase Return";
 
//       const iHead = isSaleRet
//         ? ["#", "Item", "Serial", "Sold Price", "Cost Price"]
//         : isPurchRet
//         ? ["#", "Item", "Serial", "Unit Price"]
//         : ["#", "Item", "Serials", "Qty", "Unit Price", "Total"];
 
//       const iBody = items.map((it, i) => {
//         const sNum   = it.serial_number || "";
//         const serStr = it.serials
//           ? it.serials.map(s => s.serial + (s.sold_price != null ? ` @${fmt(s.sold_price)}` : "")).join(", ")
//           : sNum;
//         if (isSaleRet)  return [i+1, it.item_name||"", sNum,   fmt(it.sold_price), fmt(it.cost_price)];
//         if (isPurchRet) return [i+1, it.item_name||"", sNum,   fmt(it.unit_price)];
//         return              [i+1, it.item_name||"", serStr, it.qty??0, fmt(it.unit_price), fmt(it.line_total)];
//       });
 
//       const iColW = isSaleRet
//         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"}, 4:{cellWidth:80,halign:"right"} }
//         : isPurchRet
//         ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"} }
//         : { 0:{cellWidth:18}, 1:{cellWidth:130}, 2:{cellWidth:130}, 3:{cellWidth:30,halign:"center"}, 4:{cellWidth:75,halign:"right"}, 5:{cellWidth:75,halign:"right"} };
 
//       doc.autoTable({
//         head:  [iHead],
//         body:  iBody,
//         startY: curY,
//         margin: { left: MARGIN, right: MARGIN },
//         theme:  "grid",
//         headStyles: { fillColor: acc, textColor: 255, fontSize: 7, fontStyle: "bold", cellPadding: 3 },
//         alternateRowStyles: { fillColor: tint },
//         styles: { fontSize: 7, cellPadding: 3 },
//         columnStyles: iColW,
//         tableWidth: CONTENT,
//       });
//       curY = doc.lastAutoTable.finalY + 4;
//     }
 
//     /* ── thin separator line ── */
//     checkNewPage(10);
//     doc.setDrawColor(...acc); doc.setLineWidth(0.3);
//     doc.line(MARGIN, curY, MARGIN + CONTENT, curY);
//     curY += 8;
//   });
 
//   addPageNumbers();
//   doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Detailed.pdf`);
// }
 
// /* ── CSV ───────────────────────────────────────────────────── */
// function downloadLedger2CSV() {
//   const d = window._ledger2Data;
//   if (!d) return;
//   const lines = [
//     ["Party Ledger", d.partyName],
//     ["Period", `${d.fromDate} to ${d.toDate}`],
//     [],
//     ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
//   ];
//   d.rows.forEach(r => {
//     const inv  = parseInvoiceDetails(r.invoice_details);
//     const type = inv ? (inv.type || "") : "";
//     const bal  = parseFloat(r.running_balance || 0);
//     lines.push([
//       r.entry_date  || "", r.journal_id  || "", type, r.description || "",
//       parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
//       parseFloat(r.credit || 0) > 0 ? r.credit : "",
//       Math.abs(bal).toFixed(2), bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
//     ]);
//   });
//   const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
//   const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
//   const url  = URL.createObjectURL(blob);
//   const a    = document.createElement("a");
//   a.href = url; a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
//   document.body.appendChild(a); a.click(); document.body.removeChild(a);
// }
 
// /* ── Autocomplete ──────────────────────────────────────────── */
// function initLedger2Autocomplete() {
//   const $input = $("#l2_party_name"), $sugg = $("#l2_suggestions");
//   const url    = "/parties/autocomplete-party";
//   let idx = -1, current = [];
 
//   $input.on("input", function () {
//     const q = $(this).val(); idx = -1;
//     if (q.length < 1) { $sugg.hide(); return; }
//     $.ajax({ url, data: { term: q }, dataType: "json",
//       success(data) {
//         $sugg.empty(); current = data;
//         if (data.length) {
//           data.forEach((p, i) => $("<div>").addClass("suggestion-item").text(p)
//             .on("mouseenter", function() { $(".suggestion-item").removeClass("highlight"); $(this).addClass("highlight"); idx = i; })
//             .on("click", function() { $input.val(p); $sugg.hide(); })
//             .appendTo($sugg));
//           $sugg.show();
//         } else $sugg.hide();
//       }
//     });
//   });
 
//   $input.on("keydown", function (e) {
//     const items = $sugg.children(".suggestion-item");
//     if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx+1)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
//     else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx-1+items.length)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
//     else if (e.key === "Enter") {
//       if (current.length===1) { $input.val(current[0]); $sugg.hide(); }
//       else if (idx>=0) { $input.val($(items[idx]).text()); $sugg.hide(); }
//     } else if (e.key === "Escape") $sugg.hide();
//   });
 
//   $(document).on("click", e => {
//     if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $sugg.hide();
//   });
// }
 
// /* ── Form ──────────────────────────────────────────────────── */
// function renderLedger2Form() {
//   const today = new Date().toISOString().split("T")[0];
//   const yearStart = `${new Date().getFullYear()}-01-01`;
//   document.getElementById("ledger2-form-area").innerHTML = `
//     <div class="l2-form-row">
//       <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
//         <label class="l2-label" for="l2_party_name">Party Name</label>
//         <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…" autocomplete="off">
//         <div id="l2_suggestions" class="suggestions-dropdown"></div>
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_from_date">From Date</label>
//         <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
//       </div>
//       <div class="l2-field">
//         <label class="l2-label" for="l2_to_date">To Date</label>
//         <input type="date" id="l2_to_date" class="l2-input" value="${today}">
//       </div>
//       <div class="l2-field l2-field-btn">
//         <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
//       </div>
//     </div>`;
//   initLedger2Autocomplete();
// }
 
// /* ── selectReport override (loads after accounts_reports.js) ── */
// function selectReport(type) {
//   $(".report-btn").removeClass("active");
//   const btnMap = {
//     "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
//     "receivable": "btn-receivable", "payable": "btn-payable",
//     "trial": "btn-trial", "ledger2": "btn-ledger2",
//   };
//   if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");
 
//   document.getElementById("ledger2-section").style.display = type === "ledger2" ? "block" : "none";
//   document.getElementById("classic-section").style.display = type !== "ledger2" ? "block" : "none";
 
//   if (type === "ledger2") {
//     renderLedger2Form();
//     document.getElementById("ledger2-container").innerHTML =
//       `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
//     return;
//   }
 
//   const $formSection = $("#report-form-container");
//   $formSection.empty();
//   $("#reportHeader").html("");
//   $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);
 
//   if      (type === "ledger")      renderLedgerForm();
//   else if (type === "cash-ledger") renderCashLedgerForm();
//   else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
//   else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
//   else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
// }
 
// $(document).ready(() => selectReport("ledger2"));


// ================================================================
//  detailed_ledger2.js  –  Professional Party Ledger  (v2)
// ================================================================

/* ── Transaction metadata ─────────────────────────────────── */
const TXN_META = {
  "Sale Invoice":     { badge: "txn-sale",     icon: "↑", label: "Sale"           },
  "Purchase Invoice": { badge: "txn-purchase",  icon: "↓", label: "Purchase"       },
  "Receipt":          { badge: "txn-receipt",   icon: "⬇", label: "Receipt"        },
  "Payment":          { badge: "txn-payment",   icon: "⬆", label: "Payment"        },
  "Sale Return":      { badge: "txn-sret",      icon: "↩", label: "Sale Return"    },
  "Purchase Return":  { badge: "txn-pret",      icon: "↪", label: "Purch. Return"  },
  "Contra Entry":     { badge: "txn-contra",    icon: "⇄", label: "Contra Entry"   },
};
function getTxnMeta(type) {
  return TXN_META[type] || { badge: "txn-misc", icon: "•", label: type || "Entry" };
}

/* ── Number formatter ─────────────────────────────────────── */
function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = parseFloat(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─────────────────────────────────────────────────────────────
   CRITICAL FIX: invoice_details can arrive as a JSON string
   from Django – always normalise to a plain object.
───────────────────────────────────────────────────────────── */
function parseInvoiceDetails(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function getCSRFToken() {
  const name = "csrftoken=";
  for (let c of decodeURIComponent(document.cookie).split(";")) {
    c = c.trim();
    if (c.startsWith(name)) return c.slice(name.length);
  }
  return "";
}

/* ================================================================
   DETAIL PANEL BUILDER  —  polished card rendered in the DOM
================================================================ */
function buildInvoicePanel(rawDetail) {
  const d = parseInvoiceDetails(rawDetail);
  if (!d) return `<div class="dp-empty">No detail available for this entry.</div>`;

  const type = d.type || "";
  const meta = getTxnMeta(type);

  /* ── Serial chips ── */
  function serialChips(serials) {
    if (!serials || !serials.length) return '<span class="dp-none">—</span>';
    return `<div class="dp-serial-list">${serials.map(s => {
      const price   = s.sold_price != null ? `<span class="dps-price">${fmt(s.sold_price)}</span>` : "";
      const comment = s.comment ? `<span class="dps-comment">${escHtml(s.comment)}</span>` : "";
      return `<span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(s.serial)}</span>${price}${comment}</span>`;
    }).join("")}</div>`;
  }

  /* ── Items table for invoices ── */
  function invoiceItemsTable(items) {
    if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
    const rows = items.map((it, i) => `
      <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
        <td class="dp-td dp-td-num">${i + 1}</td>
        <td class="dp-td">
          <div class="dp-item-name">${escHtml(it.item_name || "")}</div>
          ${it.serials ? serialChips(it.serials) : ""}
        </td>
        <td class="dp-td dp-td-r">${it.qty ?? "—"}</td>
        <td class="dp-td dp-td-r">${fmt(it.unit_price)}</td>
        <td class="dp-td dp-td-r dp-td-total">${fmt(it.line_total)}</td>
      </tr>`).join("");
    return `
      <table class="dp-items-table">
        <thead><tr>
          <th class="dp-th dp-th-num">#</th>
          <th class="dp-th">Item &amp; Serials</th>
          <th class="dp-th dp-th-r">Qty</th>
          <th class="dp-th dp-th-r">Unit Price</th>
          <th class="dp-th dp-th-r">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
          <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
        </tr></tfoot>
      </table>`;
  }

  /* ── Items table for Purchase Return ── */
  function prItemsTable(items) {
    if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
    return `
      <table class="dp-items-table">
        <thead><tr>
          <th class="dp-th dp-th-num">#</th>
          <th class="dp-th">Item</th>
          <th class="dp-th">Serial Number</th>
          <th class="dp-th dp-th-r">Unit Price</th>
        </tr></thead>
        <tbody>${items.map((it, i) => `
          <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
            <td class="dp-td dp-td-num">${i + 1}</td>
            <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
            <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
            <td class="dp-td dp-td-r dp-td-total">${fmt(it.unit_price)}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="3" class="dp-td dp-tfoot-label">Grand Total</td>
          <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
        </tr></tfoot>
      </table>`;
  }

  /* ── Items table for Sale Return ── */
  function srItemsTable(items) {
    if (!items || !items.length) return `<p class="dp-none">No line items.</p>`;
    return `
      <table class="dp-items-table">
        <thead><tr>
          <th class="dp-th dp-th-num">#</th>
          <th class="dp-th">Item</th>
          <th class="dp-th">Serial Number</th>
          <th class="dp-th dp-th-r">Sold Price</th>
          <th class="dp-th dp-th-r">Cost Price</th>
        </tr></thead>
        <tbody>${items.map((it, i) => `
          <tr class="${i % 2 === 0 ? "dp-row-even" : "dp-row-odd"}">
            <td class="dp-td dp-td-num">${i + 1}</td>
            <td class="dp-td dp-item-name">${escHtml(it.item_name || "")}</td>
            <td class="dp-td"><span class="dps-chip"><span class="dps-icon">⬡</span><span class="dps-num">${escHtml(it.serial_number || "")}</span></span></td>
            <td class="dp-td dp-td-r">${fmt(it.sold_price)}</td>
            <td class="dp-td dp-td-r dp-td-total">${fmt(it.cost_price)}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="4" class="dp-td dp-tfoot-label">Grand Total</td>
          <td class="dp-td dp-td-r dp-tfoot-total">${fmt(d.total_amount)}</td>
        </tr></tfoot>
      </table>`;
  }

  /* ── Payment / Receipt field grid ── */
  function paymentCard(fields) {
    const visible = fields.filter(([, v]) => v !== null && v !== undefined && v !== "");
    return `<div class="dp-pay-grid">
      ${visible.map(([label, val]) => `
        <div class="dp-pay-row">
          <span class="dp-pay-label">${label}</span>
          <span class="dp-pay-val">${escHtml(String(val))}</span>
        </div>`).join("")}
    </div>`;
  }

  /* ── Top strip shared across all types ── */
  function topStrip(refLabel, refNum, partyLabel, partyVal, dateVal, amtLabel, amtVal) {
    return `
      <div class="dp-top-strip dp-strip-${meta.badge}">
        <div class="dp-strip-left">
          <span class="dp-strip-badge ${meta.badge}">${meta.icon} ${meta.label}</span>
          <span class="dp-strip-ref">${refLabel} <strong>#${refNum}</strong></span>
        </div>
        <div class="dp-strip-mid">
          <span class="dp-strip-field">
            <span class="dp-sf-label">${partyLabel}</span>
            <span class="dp-sf-val">${escHtml(partyVal || "—")}</span>
          </span>
          <span class="dp-strip-field">
            <span class="dp-sf-label">Date</span>
            <span class="dp-sf-val">${dateVal || "—"}</span>
          </span>
        </div>
        <div class="dp-strip-right">
          <span class="dp-sf-label">${amtLabel}</span>
          <span class="dp-strip-amount">${fmt(amtVal)}</span>
        </div>
      </div>`;
  }

  /* ── Dispatch by type ── */
  if (type === "Sale Invoice") {
    return topStrip("Invoice", d.sales_invoice_id, "Customer", d.customer, d.invoice_date, "Total", d.total_amount)
         + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;

  } else if (type === "Purchase Invoice") {
    return topStrip("Invoice", d.purchase_invoice_id, "Vendor", d.vendor, d.invoice_date, "Total", d.total_amount)
         + `<div class="dp-body">${invoiceItemsTable(d.items)}</div>`;

  } else if (type === "Receipt") {
    return topStrip("Receipt", d.receipt_id, "Party", d.party, d.receipt_date, "Amount", d.amount)
         + `<div class="dp-body">${paymentCard([
              ["Method",      d.method],
              ["Reference #", d.reference_no],
              ["Notes",       d.notes],
              ["Description", d.description],
            ])}</div>`;

  } else if (type === "Payment") {
    return topStrip("Payment", d.payment_id, "Party", d.party, d.payment_date, "Amount", d.amount)
         + `<div class="dp-body">${paymentCard([
              ["Method",      d.method],
              ["Reference #", d.reference_no],
              ["Notes",       d.notes],
              ["Description", d.description],
            ])}</div>`;

  } else if (type === "Purchase Return") {
    return topStrip("Return", d.purchase_return_id, "Vendor", d.vendor, d.return_date, "Total", d.total_amount)
         + `<div class="dp-body">${prItemsTable(d.items)}</div>`;

  } else if (type === "Sale Return") {
    return topStrip("Return", d.sales_return_id, "Customer", d.customer, d.return_date, "Total", d.total_amount)
         + `<div class="dp-body">${srItemsTable(d.items)}</div>`;

  } else if (type === "Contra Entry") {
    return topStrip("Contra", d.contra_id, "From → To", `${d.from_party} → ${d.to_party}`, d.contra_date, "Amount", d.amount)
         + `<div class="dp-body">${paymentCard([
              ["From (credited)", d.from_party],
              ["To (debited)",    d.to_party],
              ["Method",          d.method],
              ["Reference #",     d.reference_no],
              ["Description",     d.description],
            ])}</div>`;

  } else {
    return `<div class="dp-empty">Unknown transaction type: ${escHtml(type)}</div>`;
  }
}

/* ================================================================
   MAIN TABLE RENDERER
================================================================ */
function renderDetailedLedger2(rows, partyName, fromDate, toDate) {
  const container = document.getElementById("ledger2-container");
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="ledger2-empty">No transactions found for <strong>${escHtml(partyName)}</strong> in this period.</div>`;
    return;
  }

  let totalDebit = 0, totalCredit = 0;
  rows.forEach(r => {
    totalDebit  += parseFloat(r.debit  || 0);
    totalCredit += parseFloat(r.credit || 0);
  });
  const closingBal = parseFloat(rows[rows.length - 1].running_balance || 0);

  // Opening balance = running_balance of first row MINUS its own debit/credit contribution
  const firstRow      = rows[0];
  const firstBal      = parseFloat(firstRow.running_balance || 0);
  const firstAmount   = parseFloat(firstRow.debit || 0) - parseFloat(firstRow.credit || 0);
  const openingBal    = firstBal - firstAmount;
  const hasOpeningBal = openingBal !== 0;

  const obClass = openingBal > 0 ? "bal-dr" : openingBal < 0 ? "bal-cr" : "bal-zero";
  const obLabel = openingBal > 0 ? "Dr" : openingBal < 0 ? "Cr" : "";

  const openingRow = hasOpeningBal ? `
    <tr class="opening-bal-row">
      <td class="col-date ob-date">${fromDate}</td>
      <td class="col-jid">—</td>
      <td class="col-type"><span class="txn-badge txn-opening">⊙ Opening</span></td>
      <td class="col-desc ob-label">Opening Balance (brought forward)</td>
      <td class="col-debit  text-right">${openingBal > 0 ? fmt(openingBal)  : ""}</td>
      <td class="col-credit text-right">${openingBal < 0 ? fmt(Math.abs(openingBal)) : ""}</td>
      <td class="col-bal text-right">
        <span class="bal-amount ${obClass}">${fmt(Math.abs(openingBal))}</span>
        ${obLabel ? `<span class="bal-dr-cr">${obLabel}</span>` : ""}
      </td>
      <td class="col-entry-by"><span class="entry-by-pill entry-by-unknown">—</span></td>
      <td class="col-toggle"></td>
    </tr>` : "";

  let lastMonth = null;
  // If opening balance row is shown, seed lastMonth so the first
  // real row still gets its month separator.
  // (leave lastMonth = null so month-sep fires on row 0 as normal)

  const rowsHtml = rows.map((r, idx) => {
    const d    = parseInvoiceDetails(r.invoice_details);
    const type = d ? (d.type || "") : "";
    const meta = getTxnMeta(type);
    const bal  = parseFloat(r.running_balance || 0);
    const balClass = bal > 0 ? "bal-dr" : bal < 0 ? "bal-cr" : "bal-zero";
    const balLabel = bal > 0 ? "Dr" : bal < 0 ? "Cr" : "";

    const rowMonth = r.entry_date ? r.entry_date.slice(0, 7) : "";
    let separator  = "";
    if (rowMonth !== lastMonth) {
      lastMonth = rowMonth;
      const monthLabel = r.entry_date
        ? new Date(r.entry_date + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })
        : "";
      separator = `<tr class="month-sep-row"><td colspan="9"><span class="month-sep-label">📅 ${monthLabel}</span></td></tr>`;
    }

    const hasDetail = !!d;
    const detailId  = `detail-${idx}`;

    return `${separator}
    <tr class="ledger2-row ${meta.badge}-row" data-idx="${idx}">
      <td class="col-date">${r.entry_date || "—"}</td>
      <td class="col-jid">${r.journal_id || "—"}</td>
      <td class="col-type">
        <span class="txn-badge ${meta.badge}">
          <span class="txn-icon">${meta.icon}</span>${meta.label}
        </span>
      </td>
      <td class="col-desc">${escHtml(r.description || "")}</td>
      <td class="col-debit  text-right">${parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : ""}</td>
      <td class="col-credit text-right">${parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : ""}</td>
      <td class="col-bal text-right">
        <span class="bal-amount ${balClass}">${fmt(Math.abs(bal))}</span>
        ${balLabel ? `<span class="bal-dr-cr">${balLabel}</span>` : ""}
      </td>
      <td class="col-entry-by">
        ${(r.created_by && r.created_by !== "N/A")
          ? `<span class="entry-by-pill"><i class="fa-solid fa-user-pen"></i> ${escHtml(r.created_by)}</span>`
          : `<span class="entry-by-pill entry-by-unknown">—</span>`}
      </td>
      <td class="col-toggle">
        ${hasDetail
          ? `<button class="expand-btn" onclick="toggleDetail('${detailId}', this)" title="View details">
               <span class="expand-icon">▼</span>
             </button>`
          : ""}
      </td>
    </tr>
    ${hasDetail ? `
    <tr class="detail-row" id="${detailId}" style="display:none;">
      <td colspan="9" class="detail-cell">
        <div class="detail-panel-wrap">
          ${buildInvoicePanel(r.invoice_details)}
        </div>
      </td>
    </tr>` : ""}`;
  }).join("");

  const closingClass = closingBal > 0 ? "bal-dr" : closingBal < 0 ? "bal-cr" : "bal-zero";
  const closingLabel = closingBal > 0 ? "Debit Balance (Party owes you)"
                     : closingBal < 0 ? "Credit Balance (You owe party)" : "Nil";

  container.innerHTML = `
    <div class="ledger2-header-bar">
      <div class="ledger2-party-info">
        <span class="ledger2-party-name">${escHtml(partyName)}</span>
        <span class="ledger2-period">${fromDate} → ${toDate}</span>
      </div>
      <div class="ledger2-summary-chips">
        ${hasOpeningBal ? `
        <div class="summary-chip chip-opening ${obClass}">
          <span class="chip-label">Opening Balance</span>
          <span class="chip-value">${fmt(Math.abs(openingBal))}</span>
          <span class="chip-sub">${openingBal > 0 ? "Debit b/f" : "Credit b/f"}</span>
        </div>` : ""}
        <div class="summary-chip chip-debit">
          <span class="chip-label">Total Debit</span>
          <span class="chip-value">${fmt(totalDebit)}</span>
        </div>
        <div class="summary-chip chip-credit">
          <span class="chip-label">Total Credit</span>
          <span class="chip-value">${fmt(totalCredit)}</span>
        </div>
        <div class="summary-chip chip-balance ${closingClass}">
          <span class="chip-label">Closing Balance</span>
          <span class="chip-value">${fmt(Math.abs(closingBal))}</span>
          <span class="chip-sub">${closingLabel}</span>
        </div>
      </div>
    </div>

    <div class="ledger2-table-wrap">
      <table class="ledger2-table" id="ledger2Table">
        <thead>
          <tr>
            <th class="col-date">Date</th>
            <th class="col-jid">J#</th>
            <th class="col-type">Type</th>
            <th class="col-desc">Description</th>
            <th class="col-debit  text-right">Debit</th>
            <th class="col-credit text-right">Credit</th>
            <th class="col-bal   text-right">Balance</th>
            <th class="col-entry-by">Entry By</th>
            <th class="col-toggle"></th>
          </tr>
        </thead>
        <tbody>${openingRow}${rowsHtml}</tbody>
        <tfoot>
          <tr class="ledger2-foot">
            <td colspan="4" class="foot-label">Totals</td>
            <td class="text-right foot-total">${fmt(totalDebit)}</td>
            <td class="text-right foot-total">${fmt(totalCredit)}</td>
            <td class="text-right foot-balance ${closingClass}">
              ${fmt(Math.abs(closingBal))}
              <span class="bal-dr-cr">${closingBal > 0 ? "Dr" : closingBal < 0 ? "Cr" : ""}</span>
            </td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="ledger2-actions">
      <button class="l2-btn l2-btn-pdf"     onclick="downloadLedger2PDF(false)">📄 PDF — Summary</button>
      <button class="l2-btn l2-btn-pdf-det" onclick="downloadLedger2PDF(true)">📋 PDF — With Details</button>
      <button class="l2-btn l2-btn-csv"     onclick="downloadLedger2CSV()">📊 Download CSV</button>
      <button class="l2-btn l2-btn-expand"  onclick="expandAllDetails()">⊞ Expand All</button>
      <button class="l2-btn l2-btn-collapse"onclick="collapseAllDetails()">⊟ Collapse All</button>
    </div>`;

  window._ledger2Data = { rows, partyName, fromDate, toDate, totalDebit, totalCredit, closingBal };
}

/* ── Toggle expand ─────────────────────────────────────────── */
function toggleDetail(id, btn) {
  const row = document.getElementById(id);
  if (!row) return;
  const isHidden = row.style.display === "none";
  row.style.display = isHidden ? "table-row" : "none";
  const icon = btn.querySelector(".expand-icon");
  if (icon) icon.textContent = isHidden ? "▲" : "▼";
  btn.classList.toggle("expanded", isHidden);
}

function expandAllDetails() {
  document.querySelectorAll(".detail-row").forEach(r => r.style.display = "table-row");
  document.querySelectorAll(".expand-btn").forEach(b => {
    b.classList.add("expanded");
    const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▲";
  });
}

function collapseAllDetails() {
  document.querySelectorAll(".detail-row").forEach(r => r.style.display = "none");
  document.querySelectorAll(".expand-btn").forEach(b => {
    b.classList.remove("expanded");
    const ic = b.querySelector(".expand-icon"); if (ic) ic.textContent = "▼";
  });
}

/* ── Fetch ─────────────────────────────────────────────────── */
function fetchDetailedLedger2() {
  const partyName = document.getElementById("l2_party_name").value.trim();
  const fromDate  = document.getElementById("l2_from_date").value;
  const toDate    = document.getElementById("l2_to_date").value;

  if (!partyName || !fromDate || !toDate) {
    Swal.fire("Missing Fields", "Please fill in all fields.", "warning"); return;
  }

  Swal.fire({ title: "Loading Ledger…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

  fetch("/accountsReports/detailed-ledger2/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify({ party_name: partyName, from_date: fromDate, to_date: toDate }),
  })
    .then(res => res.json())
    .then(data => {
      Swal.close();
      if (data.error) { Swal.fire("Error", data.error, "error"); return; }
      renderDetailedLedger2(data, partyName, fromDate, toDate);
    })
    .catch(() => Swal.fire("Error", "Failed to fetch ledger data.", "error"));
}

/* ================================================================
   PDF  —  two modes
   downloadLedger2PDF(false)  →  Summary (landscape, table only)
   downloadLedger2PDF(true)   →  Detailed (portrait, per-row cards)
================================================================ */
function downloadLedger2PDF(withDetails) {
  const { jsPDF } = window.jspdf;
  const d = window._ledger2Data;
  if (!d) { Swal.fire("No Data", "Generate the ledger first.", "warning"); return; }

  const orientation = withDetails ? "p" : "l";
  const doc  = new jsPDF(orientation, "pt", "a4");
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  /* ── shared page header ── */
  function drawPageHeader() {
    doc.setFillColor(30, 58, 128);
    doc.rect(0, 0, pageW, 52, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`Party Ledger  —  ${d.partyName}`, 18, 22);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Period: ${d.fromDate}  →  ${d.toDate}`, 18, 37);
    const sumTxt = `Total Debit: ${fmt(d.totalDebit)}    Total Credit: ${fmt(d.totalCredit)}    Closing: ${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`;
    doc.text(sumTxt, pageW - 18, 37, { align: "right" });
    doc.setTextColor(0);
  }

  function addPageNumbers() {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(140);
      doc.text(`Page ${i} of ${total}`, pageW - 18, pageH - 12, { align: "right" });
      doc.text(`Generated: ${new Date().toLocaleString("en-PK")}`, 18, pageH - 12);
      doc.setTextColor(0);
    }
  }

  /* ══════════════════════════════════
     MODE A — Summary (landscape)
  ══════════════════════════════════ */
  if (!withDetails) {
    drawPageHeader();

    const tableRows = d.rows.map(r => {
      const inv  = parseInvoiceDetails(r.invoice_details);
      const type = inv ? (inv.type || "") : "";
      const bal  = parseFloat(r.running_balance || 0);
      return [
        r.entry_date  || "",
        String(r.journal_id || ""),
        type,
        r.description || "",
        parseFloat(r.debit  || 0) > 0 ? fmt(r.debit)  : "",
        parseFloat(r.credit || 0) > 0 ? fmt(r.credit) : "",
        `${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
      ];
    });

    doc.autoTable({
      head: [["Date", "J#", "Type", "Description", "Debit", "Credit", "Balance"]],
      body: tableRows,
      startY: 60,
      theme: "grid",
      headStyles: { fillColor: [30, 80, 160], textColor: 255, fontSize: 8, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 253] },
      styles: { fontSize: 7.5, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 62 }, 1: { cellWidth: 32, halign: "center" },
        2: { cellWidth: 82 }, 3: { cellWidth: 230 },
        4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 72, halign: "right" },
        6: { cellWidth: 80, halign: "right" },
      },
      foot: [["", "", "", "TOTALS",
        fmt(d.totalDebit), fmt(d.totalCredit),
        `${fmt(Math.abs(d.closingBal))} ${d.closingBal > 0 ? "Dr" : d.closingBal < 0 ? "Cr" : ""}`]],
      footStyles: { fillColor: [30, 58, 128], textColor: 255, fontStyle: "bold", fontSize: 8 },
    });

    addPageNumbers();
    doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Summary.pdf`);
    return;
  }

  /* ══════════════════════════════════════════
     MODE B — Detailed (portrait A4)
     Each ledger row renders as a colour-coded
     card with its full invoice detail below.
  ══════════════════════════════════════════ */
  const MARGIN  = 18;
  const CONTENT = pageW - MARGIN * 2;

  const TYPE_TINT = {
    "Sale Invoice":     [232, 244, 255], "Purchase Invoice": [243, 240, 255],
    "Receipt":          [232, 255, 242], "Payment":          [255, 243, 232],
    "Sale Return":      [255, 251, 224], "Purchase Return":  [232, 240, 255],
  };
  const TYPE_ACCENT = {
    "Sale Invoice":     [21, 101, 192], "Purchase Invoice": [91,  33, 182],
    "Receipt":          [21, 127,  75], "Payment":          [194, 65,  12],
    "Sale Return":      [180, 83,   9], "Purchase Return":  [30,  64, 175],
  };

  drawPageHeader();
  let curY = 60;

  function checkNewPage(needed) {
    if (curY + needed > pageH - 28) {
      doc.addPage();
      curY = 18;
    }
  }

  d.rows.forEach(r => {
    const inv   = parseInvoiceDetails(r.invoice_details);
    const type  = inv ? (inv.type || "") : "";
    const meta  = getTxnMeta(type);
    const bal   = parseFloat(r.running_balance || 0);
    const tint  = TYPE_TINT[type]   || [245, 245, 245];
    const acc   = TYPE_ACCENT[type] || [80, 80, 80];

    /* ── Accent header bar ── */
    checkNewPage(22);
    doc.setFillColor(...acc);
    doc.rect(MARGIN, curY, CONTENT, 20, "F");
    doc.setTextColor(255);
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`${meta.icon}  ${type}   |   J# ${r.journal_id || ""}   |   ${r.entry_date || ""}`, MARGIN + 6, curY + 13);

    const drCrTxt = [
      parseFloat(r.debit  || 0) > 0 ? `Dr: ${fmt(r.debit)}`  : "",
      parseFloat(r.credit || 0) > 0 ? `Cr: ${fmt(r.credit)}` : "",
      `Bal: ${fmt(Math.abs(bal))} ${bal > 0 ? "Dr" : bal < 0 ? "Cr" : ""}`,
    ].filter(Boolean).join("   ");
    doc.setFont("helvetica", "normal");
    doc.text(drCrTxt, MARGIN + CONTENT - 6, curY + 13, { align: "right" });
    doc.setTextColor(0);
    curY += 20;

    /* ── Description sub-bar ── */
    if (r.description) {
      checkNewPage(14);
      doc.setFillColor(240, 242, 250);
      doc.rect(MARGIN, curY, CONTENT, 14, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 100);
      doc.text(String(r.description), MARGIN + 6, curY + 10);
      doc.setTextColor(0);
      curY += 14;
    }

    if (!inv) { curY += 6; return; }

    const isPayment = type === "Receipt" || type === "Payment";

    if (isPayment) {
      /* ── Receipt / Payment detail grid ── */
      const fields = [
        ["Party",       inv.party || "—"],
        ["Date",        inv.receipt_date || inv.payment_date || "—"],
        ["Amount",      fmt(inv.amount)],
        ["Method",      inv.method || "—"],
        ["Reference #", inv.reference_no || "—"],
        ...(inv.notes       ? [["Notes",       inv.notes]]       : []),
        ...(inv.description ? [["Description", inv.description]] : []),
      ];

      const COLS   = 3;
      const CELL_W = CONTENT / COLS;
      const CELL_H = 18;
      const gridH  = Math.ceil(fields.length / COLS) * CELL_H + 6;
      checkNewPage(gridH);
      doc.setFillColor(...tint);
      doc.rect(MARGIN, curY, CONTENT, gridH, "F");

      fields.forEach(([label, val], fi) => {
        const col = fi % COLS;
        const row = Math.floor(fi / COLS);
        const cx  = MARGIN + col * CELL_W + 6;
        const cy  = curY + row * CELL_H + 11;
        doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
        doc.text(label.toUpperCase(), cx, cy);
        doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.setFontSize(8);
        doc.text(String(val), cx, cy + 8);
      });
      curY += gridH + 4;

    } else {
      /* ── Invoice / Return items table ── */
      const items = inv.items || [];
      if (items.length === 0) { curY += 6; return; }

      /* party / date info bar */
      checkNewPage(18);
      doc.setFillColor(...tint);
      doc.rect(MARGIN, curY, CONTENT, 18, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...acc);
      const pLabel = ["Sale Invoice", "Sale Return"].includes(type) ? "Customer" : "Vendor";
      const pVal   = inv.customer || inv.vendor || "—";
      const dVal   = inv.invoice_date || inv.return_date || "—";
      doc.text(`${pLabel}: ${pVal}   |   Date: ${dVal}   |   Total: ${fmt(inv.total_amount)}`, MARGIN + 6, curY + 12);
      doc.setTextColor(0);
      curY += 18;

      const isSaleRet  = type === "Sale Return";
      const isPurchRet = type === "Purchase Return";

      const iHead = isSaleRet
        ? ["#", "Item", "Serial", "Sold Price", "Cost Price"]
        : isPurchRet
        ? ["#", "Item", "Serial", "Unit Price"]
        : ["#", "Item", "Serials", "Qty", "Unit Price", "Total"];

      const iBody = items.map((it, i) => {
        const sNum   = it.serial_number || "";
        const serStr = it.serials
          ? it.serials.map(s => s.serial + (s.sold_price != null ? ` @${fmt(s.sold_price)}` : "")).join(", ")
          : sNum;
        if (isSaleRet)  return [i+1, it.item_name||"", sNum,   fmt(it.sold_price), fmt(it.cost_price)];
        if (isPurchRet) return [i+1, it.item_name||"", sNum,   fmt(it.unit_price)];
        return              [i+1, it.item_name||"", serStr, it.qty??0, fmt(it.unit_price), fmt(it.line_total)];
      });

      const iColW = isSaleRet
        ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"}, 4:{cellWidth:80,halign:"right"} }
        : isPurchRet
        ? { 0:{cellWidth:18}, 1:{cellWidth:140}, 2:{cellWidth:110}, 3:{cellWidth:80,halign:"right"} }
        : { 0:{cellWidth:18}, 1:{cellWidth:130}, 2:{cellWidth:130}, 3:{cellWidth:30,halign:"center"}, 4:{cellWidth:75,halign:"right"}, 5:{cellWidth:75,halign:"right"} };

      doc.autoTable({
        head:  [iHead],
        body:  iBody,
        startY: curY,
        margin: { left: MARGIN, right: MARGIN },
        theme:  "grid",
        headStyles: { fillColor: acc, textColor: 255, fontSize: 7, fontStyle: "bold", cellPadding: 3 },
        alternateRowStyles: { fillColor: tint },
        styles: { fontSize: 7, cellPadding: 3 },
        columnStyles: iColW,
        tableWidth: CONTENT,
      });
      curY = doc.lastAutoTable.finalY + 4;
    }

    /* ── thin separator line ── */
    checkNewPage(10);
    doc.setDrawColor(...acc); doc.setLineWidth(0.3);
    doc.line(MARGIN, curY, MARGIN + CONTENT, curY);
    curY += 8;
  });

  addPageNumbers();
  doc.save(`Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}_${d.toDate}_Detailed.pdf`);
}

/* ── CSV ───────────────────────────────────────────────────── */
function downloadLedger2CSV() {
  const d = window._ledger2Data;
  if (!d) return;
  const lines = [
    ["Party Ledger", d.partyName],
    ["Period", `${d.fromDate} to ${d.toDate}`],
    [],
    ["Date", "Journal ID", "Type", "Description", "Debit", "Credit", "Balance", "Dr/Cr"],
  ];
  d.rows.forEach(r => {
    const inv  = parseInvoiceDetails(r.invoice_details);
    const type = inv ? (inv.type || "") : "";
    const bal  = parseFloat(r.running_balance || 0);
    lines.push([
      r.entry_date  || "", r.journal_id  || "", type, r.description || "",
      parseFloat(r.debit  || 0) > 0 ? r.debit  : "",
      parseFloat(r.credit || 0) > 0 ? r.credit : "",
      Math.abs(bal).toFixed(2), bal > 0 ? "Dr" : bal < 0 ? "Cr" : "",
    ]);
  });
  const csv  = lines.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `Ledger_${d.partyName.replace(/\s+/g, "_")}_${d.fromDate}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ── Autocomplete ──────────────────────────────────────────── */
function initLedger2Autocomplete() {
  const $input = $("#l2_party_name"), $sugg = $("#l2_suggestions");
  const url    = "/parties/autocomplete-party";
  let idx = -1, current = [];

  $input.on("input", function () {
    const q = $(this).val(); idx = -1;
    if (q.length < 1) { $sugg.hide(); return; }
    $.ajax({ url, data: { term: q }, dataType: "json",
      success(data) {
        $sugg.empty(); current = data;
        if (data.length) {
          data.forEach((p, i) => $("<div>").addClass("suggestion-item").text(p)
            .on("mouseenter", function() { $(".suggestion-item").removeClass("highlight"); $(this).addClass("highlight"); idx = i; })
            .on("click", function() { $input.val(p); $sugg.hide(); })
            .appendTo($sugg));
          $sugg.show();
        } else $sugg.hide();
      }
    });
  });

  $input.on("keydown", function (e) {
    const items = $sugg.children(".suggestion-item");
    if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx+1)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx-1+items.length)%items.length; items.removeClass("highlight"); $(items[idx]).addClass("highlight"); }
    else if (e.key === "Enter") {
      if (current.length===1) { $input.val(current[0]); $sugg.hide(); }
      else if (idx>=0) { $input.val($(items[idx]).text()); $sugg.hide(); }
    } else if (e.key === "Escape") $sugg.hide();
  });

  $(document).on("click", e => {
    if (!$(e.target).closest("#l2_party_name, #l2_suggestions").length) $sugg.hide();
  });
}

/* ── Form ──────────────────────────────────────────────────── */
function renderLedger2Form() {
  const today = new Date().toISOString().split("T")[0];
  const yearStart = `${new Date().getFullYear()}-01-01`;
  document.getElementById("ledger2-form-area").innerHTML = `
    <div class="l2-form-row">
      <div class="l2-field autocomplete-container" style="position:relative; flex:2;">
        <label class="l2-label" for="l2_party_name">Party Name</label>
        <input type="text" id="l2_party_name" class="l2-input" placeholder="Search party…" autocomplete="off">
        <div id="l2_suggestions" class="suggestions-dropdown"></div>
      </div>
      <div class="l2-field">
        <label class="l2-label" for="l2_from_date">From Date</label>
        <input type="date" id="l2_from_date" class="l2-input" value="${yearStart}">
      </div>
      <div class="l2-field">
        <label class="l2-label" for="l2_to_date">To Date</label>
        <input type="date" id="l2_to_date" class="l2-input" value="${today}">
      </div>
      <div class="l2-field l2-field-btn">
        <button class="l2-generate-btn" onclick="fetchDetailedLedger2()">Generate Ledger</button>
      </div>
    </div>`;
  initLedger2Autocomplete();
}

/* ── selectReport override (loads after accounts_reports.js) ── */
function selectReport(type) {
  $(".report-btn").removeClass("active");
  const btnMap = {
    "ledger": "btn-ledger", "cash-ledger": "btn-cash-ledger",
    "receivable": "btn-receivable", "payable": "btn-payable",
    "trial": "btn-trial", "ledger2": "btn-ledger2",
  };
  if (btnMap[type]) $(`#${btnMap[type]}`).addClass("active");

  document.getElementById("ledger2-section").style.display = type === "ledger2" ? "block" : "none";
  document.getElementById("classic-section").style.display = type !== "ledger2" ? "block" : "none";

  if (type === "ledger2") {
    renderLedger2Form();
    document.getElementById("ledger2-container").innerHTML =
      `<div class="ledger2-empty">Enter a party name and date range, then click <strong>Generate Ledger</strong>.</div>`;
    return;
  }

  const $formSection = $("#report-form-container");
  $formSection.empty();
  $("#reportHeader").html("");
  $("#reportBody").html(`<tr><td class="no-data">Loading...</td></tr>`);

  if      (type === "ledger")      renderLedgerForm();
  else if (type === "cash-ledger") renderCashLedgerForm();
  else if (type === "receivable")  { $formSection.empty(); fetchAccountsReceivable(); }
  else if (type === "payable")     { $formSection.empty(); fetchAccountsPayable(); }
  else                             { $("#report-form-container").html(""); fetchTrialBalance(); }
}

$(document).ready(() => selectReport("ledger2"));