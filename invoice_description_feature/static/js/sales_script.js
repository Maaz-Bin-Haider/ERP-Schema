// /* ============================================================
//    SALE PAGE — COMPLETE SCRIPT
//    Features:
//      - Item name auto-filled from serial (readonly display, never user-editable)
//      - Unit price always starts at 0.00 (purchase price NOT shown)
//      - Single-serial lookup + bulk paste from Excel
//      - Duplicate serial guard (cross-row)
//      - Total Qty + Total Items counters
//      - PDF invoice download
//      - Previous / Next / Current navigation
//      - Sale history summary popup
//    ============================================================ */

// // ── Constants ──────────────────────────────────────────────────────────────
// const SERIAL_SEPARATORS_RE = /[\r\n\t,;]+/;

// // Per-serial lookup promise cache — avoids duplicate AJAX for same serial
// const _serialLookupCache = new Map();


// // ── Utilities ──────────────────────────────────────────────────────────────
// function _norm(s) { return (s == null ? "" : String(s)).trim(); }

// function escapeHtml(s) {
//   return String(s == null ? "" : s)
//     .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
//     .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
// }

// function getCSRFToken() {
//   for (const c of document.cookie.split(";").map(s => s.trim())) {
//     if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
//   }
//   return null;
// }


// // ── Serial lookup (backend) ─────────────────────────────────────────────────
// function fetchItemBySerial(serial) {
//   serial = _norm(serial);
//   if (!serial) return Promise.resolve({ success: false, message: "Empty serial." });
//   if (_serialLookupCache.has(serial)) return _serialLookupCache.get(serial);
//   const p = fetch(`/sale/lookup/${encodeURIComponent(serial)}/`, {
//     method: "GET",
//     headers: { "X-Requested-With": "XMLHttpRequest" },
//   }).then(r => r.json()).catch(() => ({ success: false, message: "Network error." }));
//   _serialLookupCache.set(serial, p);
//   return p;
// }

// function invalidateSerialCache(serial) {
//   serial = _norm(serial);
//   if (serial) _serialLookupCache.delete(serial);
// }


// // ── Duplicate detection ─────────────────────────────────────────────────────
// // Returns a Map of  UPPER_SERIAL → input element  for every filled serial in
// // the form EXCEPT the given input.
// function collectAllSerials(exceptInput = null) {
//   const map = new Map();
//   document.querySelectorAll(".item-row .serials input").forEach(inp => {
//     if (inp === exceptInput) return;
//     const v = _norm(inp.value);
//     if (!v) return;
//     map.set(v.toUpperCase(), inp);
//   });
//   return map;
// }


// // ── Totals ─────────────────────────────────────────────────────────────────
// function calculateTotal() {
//   let amount = 0, totalQty = 0, itemCount = 0;
//   document.querySelectorAll(".item-row").forEach(row => {
//     const price = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const qty   = parseInt(row.querySelector(".qty-box")?.value)   || 0;
//     amount   += price * qty;
//     totalQty += qty;
//     if (qty > 0 || price > 0) itemCount++;
//   });
//   document.getElementById("totalAmount").textContent     = amount.toFixed(2);
//   document.getElementById("totalQtyCount").textContent   = totalQty;
//   document.getElementById("totalItemsCount").textContent = itemCount;
// }

// function updateQty(row) {
//   const inputs = row.querySelectorAll(".serials input");
//   let count = 0;
//   inputs.forEach(inp => { if (inp.value.trim()) count++; });
//   row.querySelector(".qty-box").value = count;
//   calculateTotal();
// }


// // ── Item-name display helper ───────────────────────────────────────────────
// // The item_name field is a hidden <input> (for form submission).
// // The visible element is a styled <div class="item-name-display">.
// function setItemNameDisplay(row, name) {
//   const hidden  = row.querySelector("input.item_name");
//   const display = row.querySelector(".item-name-display");
//   if (hidden)  hidden.value = name || "";
//   if (display) {
//     if (name && name.trim()) {
//       display.textContent = name;
//       display.classList.remove("empty");
//     } else {
//       display.innerHTML   = '<span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>';
//       display.classList.add("empty");
//     }
//   }
// }

// function getItemNameFromRow(row) {
//   const hidden = row.querySelector("input.item_name");
//   return hidden ? _norm(hidden.value) : "";
// }


// // ── Serial commit handler ───────────────────────────────────────────────────
// function handleSerialCommit(input, row) {
//   const raw = _norm(input.value);
//   if (!raw) { updateQty(row); return; }

//   // Multi-value paste into a single input → redirect to bulk processor
//   if (SERIAL_SEPARATORS_RE.test(raw)) {
//     input.value = "";
//     updateQty(row);
//     processBulkSerialsText(raw, { preferRow: row });
//     return;
//   }

//   // Duplicate check
//   const existing = collectAllSerials(input);
//   if (existing.has(raw.toUpperCase())) {
//     Swal.fire({ icon: "warning", title: "Duplicate Serial",
//       text: `Serial '${raw}' is already added to this invoice.` });
//     input.value = "";
//     updateQty(row);
//     input.focus();
//     return;
//   }

//   // Valid single serial — look up item
//   input.classList.remove("serial-valid");
//   fetchItemBySerial(raw).then(data => {
//     if (!data || !data.success) {
//       Swal.fire({ icon: "error", title: "Serial Not Found",
//         text: (data && data.message) || `Serial '${raw}' could not be found in stock.` });
//       invalidateSerialCache(raw);
//       input.value = "";
//       updateQty(row);
//       input.focus();
//       return;
//     }

//     const currentItem = getItemNameFromRow(row).toUpperCase();
//     const fetchedItem = (data.item_name || "").toUpperCase();

//     if (!currentItem) {
//       // Empty row — adopt item
//       setItemNameDisplay(row, data.item_name);
//     } else if (currentItem !== fetchedItem) {
//       // Wrong item — move serial to correct row
//       input.value = "";
//       updateQty(row);
//       Swal.fire({ icon: "info", title: "Serial Belongs to Another Item",
//         html: `Serial <b>${escapeHtml(raw)}</b> belongs to <b>${escapeHtml(data.item_name)}</b>, not this row.<br>It has been moved to the correct row.` });
//       addSerialToItem(data.item_name, raw);
//       return;
//     }

//     // ── PRICE: always 0.00, never auto-fill purchase price ──
//     const priceInput = row.querySelector(".unit_price");
//     if (priceInput && !priceInput.value) {
//       priceInput.value = "0.00";
//     }

//     input.classList.add("serial-valid");
//     updateQty(row);
//     calculateTotal();
//   });
// }


// // ── addSerialToItem — find or create a row for the given item, add serial ──
// function addSerialToItem(itemName, serialValue) {
//   const upperName = (itemName || "").toUpperCase();
//   // Don't add if already present
//   if (collectAllSerials().has(serialValue.toUpperCase())) return null;

//   // Look for existing row with this item
//   let targetRow = null;
//   document.querySelectorAll(".item-row").forEach(r => {
//     if (targetRow) return;
//     if (getItemNameFromRow(r).toUpperCase() === upperName) targetRow = r;
//   });

//   if (!targetRow) {
//     addItemRow(false);
//     const rows = document.querySelectorAll(".item-row");
//     targetRow = rows[rows.length - 1];
//     setItemNameDisplay(targetRow, itemName);
//     const priceInput = targetRow.querySelector(".unit_price");
//     if (priceInput && !priceInput.value) priceInput.value = "0.00";
//   }

//   // Find first empty slot or add a new serial input
//   let slot = null;
//   targetRow.querySelectorAll(".serials input").forEach(inp => {
//     if (!slot && !inp.value.trim()) slot = inp;
//   });
//   if (!slot) {
//     addSerial(targetRow, false);
//     const all = targetRow.querySelectorAll(".serials input");
//     slot = all[all.length - 1];
//   }
//   slot.value = serialValue;
//   slot.classList.add("serial-valid");
//   updateQty(targetRow);
//   calculateTotal();
//   return targetRow;
// }


// // ── addSerial — create a serial input inside a row ──────────────────────────
// function addSerial(row, autoFocus = true) {
//   const serialsDiv = row.querySelector(".serials");
//   const input = document.createElement("input");
//   input.type        = "text";
//   input.placeholder = "Enter serial…";
//   input.oninput     = () => updateQty(row);
//   input.onkeydown   = (e) => handleEnterKey(e, input);

//   // Commit on blur or Enter
//   input.addEventListener("change", () => handleSerialCommit(input, row));

//   // Multi-line paste interception
//   input.addEventListener("paste", e => {
//     const text = (e.clipboardData || window.clipboardData).getData("text");
//     if (text && SERIAL_SEPARATORS_RE.test(text)) {
//       e.preventDefault();
//       input.value = "";
//       updateQty(row);
//       processBulkSerialsText(text, { preferRow: row });
//     }
//   });

//   serialsDiv.appendChild(input);
//   updateQty(row);
//   if (autoFocus) input.focus();
// }


// // ── removeSerial ────────────────────────────────────────────────────────────
// function removeSerial(row) {
//   const serialsDiv = row.querySelector(".serials");
//   if (serialsDiv.lastChild) {
//     serialsDiv.removeChild(serialsDiv.lastChild);
//     updateQty(row);
//     const remaining = serialsDiv.querySelectorAll("input");
//     if (remaining.length) remaining[remaining.length - 1].focus();
//     else row.querySelector(".add-serial").focus();
//   }
// }


// // ── addItemRow — create a new blank item row ─────────────────────────────────
// function addItemRow(shouldFocus = true) {
//   const itemsDiv = document.getElementById("items");
//   const row = document.createElement("div");
//   row.className = "item-row";

//   row.innerHTML = `
//     <!-- Item name: hidden input for submission + visible display div -->
//     <div class="item_name_field">
//       <input type="text" class="item_name" value="" style="display:none;" autocomplete="off">
//       <div class="item-name-display empty">
//         <span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>
//       </div>
//     </div>

//     <!-- Unit price -->
//     <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00" value="">

//     <!-- Qty (read-only, auto-counted) -->
//     <input type="number" class="qty-box" readonly value="0">

//     <!-- Empty col (aligns with col-header gap) -->
//     <div></div>

//     <!-- Serials -->
//     <div class="serials"></div>

//     <!-- Row-level action buttons -->
//     <div class="row-actions">
//       <button type="button" class="custom-btn add-serial">＋ Serial</button>
//       <button type="button" class="custom-btn remove-serial">− Serial</button>
//       <button type="button" class="custom-btn remove-item">✕ Remove</button>
//     </div>
//   `;

//   row.querySelector(".add-serial").onclick  = () => addSerial(row);
//   row.querySelector(".remove-serial").onclick = () => removeSerial(row);
//   row.querySelector(".remove-item").onclick = () => { row.remove(); calculateTotal(); };
//   row.querySelector(".unit_price").oninput  = () => calculateTotal();

//   itemsDiv.appendChild(row);

//   // First serial input (no autofocus on initial load)
//   addSerial(row, false);

//   if (shouldFocus) {
//     // Focus the first serial input since item name is auto-filled
//     const firstSerial = row.querySelector(".serials input");
//     if (firstSerial) firstSerial.focus();
//   }
// }


// // ── Bulk serial dialog ───────────────────────────────────────────────────────
// function openBulkSerialsDialog() {
//   Swal.fire({
//     title: "📋 Bulk Paste Serials",
//     html: `
//       <div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
//         Paste serial numbers separated by <b>newline, tab, comma, or semicolon</b>.<br>
//         Works directly with Excel column copy (Ctrl+C → Ctrl+V).
//       </div>
//       <textarea id="bulkSerialsTextarea"
//         style="width:100%;min-height:200px;padding:12px;font-family:'DM Mono',monospace;
//                font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;
//                background:#f9fafb;color:#111827;"
//         placeholder="SN001&#10;SN002&#10;SN003&#10;…"></textarea>
//       <div style="margin-top:8px;font-size:12px;color:#9ca3af;">
//         Items will be grouped by their item type automatically.
//       </div>
//     `,
//     showCancelButton: true,
//     confirmButtonText: "Process Serials",
//     cancelButtonText: "Cancel",
//     confirmButtonColor: "#2563eb",
//     focusConfirm: false,
//     width: "540px",
//     preConfirm: () => {
//       const ta   = document.getElementById("bulkSerialsTextarea");
//       const text = (ta && ta.value) || "";
//       if (!text.trim()) {
//         Swal.showValidationMessage("⚠️ Please paste at least one serial number.");
//         return false;
//       }
//       return text;
//     },
//     didOpen: () => {
//       const ta = document.getElementById("bulkSerialsTextarea");
//       if (ta) ta.focus();
//     },
//   }).then(res => {
//     if (res.isConfirmed && res.value) processBulkSerialsText(res.value);
//   });
// }


// // ── Process bulk serial text ─────────────────────────────────────────────────
// function processBulkSerialsText(rawText, { preferRow = null } = {}) {
//   if (!rawText || !rawText.trim()) return;

//   // Show loading
//   Swal.fire({ title: "Processing serials…", allowOutsideClick: false,
//     didOpen: () => Swal.showLoading() });

//   fetch("/sale/bulk-lookup/", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ raw: rawText }),
//   }).then(r => r.json()).then(data => {
//     Swal.close();

//     if (!data || !data.success) {
//       Swal.fire({ icon: "error", title: "Bulk Lookup Failed",
//         text: (data && data.message) || "Unable to process pasted serials." });
//       return;
//     }

//     const existing          = collectAllSerials();
//     const accepted          = [];
//     const skippedDuplicates = [];
//     const invalid           = Array.isArray(data.invalid) ? data.invalid.slice() : [];

//     (data.groups || []).forEach(group => {
//       const fresh = [];
//       group.serials.forEach(s => {
//         const key = s.toUpperCase();
//         if (existing.has(key)) { skippedDuplicates.push(s); }
//         else { existing.set(key, true); fresh.push(s); }
//       });
//       if (!fresh.length) return;

//       // Try to adopt the preferRow if it's still empty
//       let targetRow = null;
//       if (preferRow && preferRow.isConnected &&
//           !getItemNameFromRow(preferRow).trim() && !accepted.length) {
//         targetRow = preferRow;
//         setItemNameDisplay(targetRow, group.item_name);
//         const pr = targetRow.querySelector(".unit_price");
//         if (pr && !pr.value) pr.value = "0.00";
//       }

//       fresh.forEach(s => {
//         if (targetRow) {
//           let slot = null;
//           targetRow.querySelectorAll(".serials input").forEach(inp => {
//             if (!slot && !inp.value.trim()) slot = inp;
//           });
//           if (!slot) {
//             addSerial(targetRow, false);
//             const all = targetRow.querySelectorAll(".serials input");
//             slot = all[all.length - 1];
//           }
//           slot.value = s;
//           slot.classList.add("serial-valid");
//           updateQty(targetRow);
//         } else {
//           addSerialToItem(group.item_name, s);
//         }
//         accepted.push(s);
//       });
//     });

//     calculateTotal();

//     // Build summary popup
//     const invalidHtml = invalid.length ? `
//       <details style="margin-top:10px;text-align:left;">
//         <summary style="cursor:pointer;color:#dc2626;font-size:13px;">
//           ❌ Show ${invalid.length} invalid serial${invalid.length>1?"s":""}
//         </summary>
//         <ul style="max-height:160px;overflow:auto;margin:6px 0 0 16px;padding:0;font-size:12px;color:#374151;">
//           ${invalid.map(i=>`<li><code>${escapeHtml(i.serial)}</code> — ${escapeHtml(i.reason)}</li>`).join("")}
//         </ul>
//       </details>` : "";

//     const dupHtml = skippedDuplicates.length ? `
//       <details style="margin-top:8px;text-align:left;">
//         <summary style="cursor:pointer;color:#d97706;font-size:13px;">
//           ⚠️ Show ${skippedDuplicates.length} duplicate${skippedDuplicates.length>1?"s":""}
//         </summary>
//         <ul style="max-height:120px;overflow:auto;margin:6px 0 0 16px;padding:0;font-size:12px;color:#374151;">
//           ${skippedDuplicates.map(s=>`<li><code>${escapeHtml(s)}</code></li>`).join("")}
//         </ul>
//       </details>` : "";

//     Swal.fire({
//       icon: accepted.length ? (invalid.length?"warning":"success") : "error",
//       title: "Bulk Serial Result",
//       html: `
//         <div style="text-align:left;line-height:1.8;font-size:14px;">
//           <div>📥 Total pasted: <b>${data.total_input}</b></div>
//           <div>✅ Added to invoice: <b style="color:#16a34a;">${accepted.length}</b></div>
//           <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${skippedDuplicates.length}</b></div>
//           <div>❌ Invalid / not in stock: <b style="color:#dc2626;">${invalid.length}</b></div>
//           ${dupHtml}${invalidHtml}
//         </div>
//       `,
//     });
//   }).catch(() => {
//     Swal.close();
//     Swal.fire({ icon: "error", title: "Network Error", text: "Could not contact server." });
//   });
// }


// // ── Build & Submit ───────────────────────────────────────────────────────────
// function buildAndSubmit(event) {
//   event.preventDefault();
//   const form   = event.target;
//   const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

//   const partyName   = document.getElementById("search_name").value.trim();
//   let   saleDate    = document.getElementById("sale_date").value;
//   if (!saleDate) saleDate = new Date().toISOString().slice(0, 10);

//   if (!partyName) {
//     Swal.fire({ icon: "warning", title: "Missing Customer",
//       text: "Please select a customer / party name before saving." });
//     document.getElementById("search_name").focus();
//     return;
//   }

//   const items = [];
//   document.querySelectorAll(".item-row").forEach(row => {
//     const item_name  = getItemNameFromRow(row);
//     const unit_price = parseFloat(row.querySelector(".unit_price").value);
//     const serials    = Array.from(row.querySelectorAll(".serials input"))
//       .map(s => s.value.trim()).filter(Boolean);
//     const qty = serials.length;
//     if (item_name && qty > 0 && !isNaN(unit_price) && unit_price > 0) {
//       items.push({ item_name, qty, unit_price, serials });
//     }
//   });

//   if (items.length === 0) {
//     Swal.fire({ icon: "warning", title: "No Valid Items",
//       text: "Add at least one item row with a serial number and a price > 0." });
//     return;
//   }

//   const currentId = document.getElementById("current_sale_id").value || null;
//   const payload   = { sale_id: currentId, party_name: partyName,
//                       sale_date: saleDate, items, action };

//   _submitSale(payload);
// }

// function _submitSale(payload) {
//   fetch("/sale/sales/", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify(payload),
//   })
//   .then(async res => {
//     if (!res.ok) {
//       let msg = "Server error.";
//       try { const e = await res.json(); if (e.message) msg = e.message; } catch {}
//       throw new Error(msg);
//     }
//     return res.json();
//   })
//   .then(data => {
//     if (data.confirm) {
//       Swal.fire({ icon: "warning", title: "Confirm Sale",
//         text: data.message || "Selling price ≤ buying price. Continue?",
//         showCancelButton: true, confirmButtonText: "Yes, proceed",
//         cancelButtonText: "Cancel", confirmButtonColor: "#2563eb" })
//       .then(r => {
//         if (r.isConfirmed) { payload.force = true; _submitSale(payload); }
//       });
//     } else if (data.success) {
//       Swal.fire({ icon: "success", title: "Success",
//         text: data.message || "Sale saved successfully.",
//         timer: 1600, showConfirmButton: false })
//       .then(() => window.location.reload());
//     } else {
//       Swal.fire({ icon: "error", title: "Error",
//         text: data.message || "Something went wrong." });
//     }
//   })
//   .catch(err => {
//     Swal.fire({ icon: "error", title: "Submission Failed",
//       text: err.message || "An unexpected error occurred." });
//   });
// }


// // ── Delete confirmation ──────────────────────────────────────────────────────
// const deleteButton = document.querySelector(".delete-btn");

// function confirmDelete(event) {
//   event.preventDefault();
//   Swal.fire({
//     title: "Delete this Sale?",
//     text: "This action cannot be undone.",
//     icon: "warning",
//     showCancelButton: true,
//     confirmButtonColor: "#dc2626",
//     cancelButtonColor: "#6b7280",
//     confirmButtonText: "Yes, delete",
//     cancelButtonText: "Cancel",
//   }).then(result => {
//     if (result.isConfirmed) {
//       deleteButton.removeEventListener("click", confirmDelete);
//       deleteButton.click();
//       setTimeout(() => deleteButton.addEventListener("click", confirmDelete), 120);
//     }
//   });
// }
// if (deleteButton) deleteButton.addEventListener("click", confirmDelete);

// document.querySelectorAll('button[type="submit"]').forEach(btn => {
//   btn.addEventListener("click", function () {
//     document.querySelectorAll('button[type="submit"]').forEach(b => b.removeAttribute("clicked"));
//     this.setAttribute("clicked", "true");
//   });
// });


// // ── Enter-key navigation ─────────────────────────────────────────────────────
// function handleEnterKey(e, input) {
//   if (e.key !== "Enter") return;
//   e.preventDefault();
//   if (!input.value.trim()) { input.focus(); return; }
//   const all = Array.from(document.querySelectorAll(
//     "input:not([readonly]):not([style*='display:none']):not([style*='display: none']), select"
//   ));
//   const idx = all.indexOf(input);
//   if (idx > -1 && idx < all.length - 1) all[idx + 1].focus();
// }


// // ── Party autocomplete ───────────────────────────────────────────────────────
// $(document).ready(function () {
//   let autocompleteUrl  = $("#search_name").data("autocomplete-url");
//   let selectedIndex    = -1;

//   $("#search_name").on("input", function () {
//     const query        = $(this).val();
//     const suggestionsBox = $("#suggestions");
//     selectedIndex = -1;

//     if (query.length >= 1) {
//       $.ajax({ url: autocompleteUrl, data: { term: query }, dataType: "json",
//         success: function (data) {
//           suggestionsBox.empty();
//           if (data.length) {
//             data.forEach(party => {
//               $("<div>").addClass("suggestion-item").text(party)
//                 .appendTo(suggestionsBox)
//                 .on("click", function () {
//                   $("#search_name").val(party);
//                   suggestionsBox.hide();
//                   // Focus first serial input
//                   const firstSerial = document.querySelector(".item-row .serials input");
//                   if (firstSerial) firstSerial.focus();
//                 });
//             });
//             suggestionsBox.show();
//           } else { suggestionsBox.hide(); }
//         },
//       });
//     } else { suggestionsBox.hide(); }
//   });

//   $("#search_name").on("keydown", function (e) {
//     const items = $("#suggestions .suggestion-item");
//     if (!items.length) return;
//     if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
//     if (e.key === "ArrowDown") {
//       e.preventDefault(); selectedIndex = (selectedIndex+1) % items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault(); selectedIndex = (selectedIndex-1+items.length) % items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "Enter" && selectedIndex >= 0) {
//       e.preventDefault(); items.eq(selectedIndex).trigger("click");
//     }
//   });

//   $(document).on("click", e => {
//     if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
//   });
// });


// // ── Navigate sale invoices ───────────────────────────────────────────────────
// async function navigateSale(action) {
//   try {
//     const currentId = document.getElementById("current_sale_id").value || "";
//     const response  = await fetch(
//       `/sale/get-sale/?action=${action}&current_id=${currentId}`,
//       { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest" } }
//     );
//     let data = await response.json();
//     if (data.success === false) {
//       Swal.fire({ icon: "info", title: "Navigation", text: data.message || "No sale found." });
//       return;
//     }
//     if (typeof data === "string") data = JSON.parse(data);
//     if (typeof data === "object" && !data.hasOwnProperty("sales_invoice_id")) {
//       try { data = JSON.parse(Object.values(data)[0]); } catch {}
//     }
//     renderSaleData(data);
//   } catch (err) {
//     Swal.fire({ icon: "error", title: "Error", text: "Failed to fetch sale data." });
//   }
// }

// function renderSaleData(data) {
//   document.getElementById("search_name").value       = data.Party || "";
//   document.getElementById("sale_date").value         = data.invoice_date || "";
//   document.getElementById("current_sale_id").value   = data.sales_invoice_id || "";

//   // Update badge
//   const badge = document.getElementById("invoiceIdBadge");
//   if (badge) badge.textContent = data.sales_invoice_id ? `#${data.sales_invoice_id}` : "#NEW";

//   // Update save button label
//   const saveBtn = document.getElementById("saveBtn");
//   if (saveBtn) {
//     saveBtn.innerHTML = data.sales_invoice_id
//       ? '<i class="fa-solid fa-pen-to-square"></i> Update Sale'
//       : '<i class="fa-solid fa-floppy-disk"></i> Save Sale';
//   }

//   // Rebuild items
//   const itemsDiv = document.getElementById("items");
//   itemsDiv.innerHTML = "";

//   if (Array.isArray(data.items)) {
//     data.items.forEach(item => {
//       const row       = document.createElement("div");
//       row.className   = "item-row";
//       row.innerHTML   = `
//         <div class="item_name_field">
//           <input type="text" class="item_name" value="${escapeHtml(item.item_name||"")}" style="display:none;" autocomplete="off">
//           <div class="item-name-display ${item.item_name?'':'empty'}">
//             ${item.item_name ? escapeHtml(item.item_name) : '<span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>'}
//           </div>
//         </div>
//         <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00" value="${item.unit_price || 0}">
//         <input type="number" class="qty-box" readonly value="${item.qty || 0}">
//         <div></div>
//         <div class="serials"></div>
//         <div class="row-actions">
//           <button type="button" class="custom-btn add-serial">＋ Serial</button>
//           <button type="button" class="custom-btn remove-serial">− Serial</button>
//           <button type="button" class="custom-btn remove-item">✕ Remove</button>
//         </div>
//       `;

//       row.querySelector(".add-serial").onclick    = () => addSerial(row);
//       row.querySelector(".remove-serial").onclick = () => removeSerial(row);
//       row.querySelector(".remove-item").onclick   = () => { row.remove(); calculateTotal(); };
//       row.querySelector(".unit_price").oninput    = () => calculateTotal();

//       const serialsDiv = row.querySelector(".serials");
//       if (Array.isArray(item.serials)) {
//         item.serials.forEach(serial => {
//           const inp       = document.createElement("input");
//           inp.type        = "text";
//           inp.placeholder = "Serial";
//           inp.value       = serial;
//           inp.classList.add("serial-valid");
//           inp.oninput     = () => updateQty(row);
//           inp.onkeydown   = e => handleEnterKey(e, inp);
//           inp.addEventListener("change", () => handleSerialCommit(inp, row));
//           inp.addEventListener("paste", e => {
//             const text = (e.clipboardData||window.clipboardData).getData("text");
//             if (text && SERIAL_SEPARATORS_RE.test(text)) {
//               e.preventDefault(); inp.value=""; updateQty(row);
//               processBulkSerialsText(text, { preferRow: row });
//             }
//           });
//           serialsDiv.appendChild(inp);
//         });
//       }

//       itemsDiv.appendChild(row);
//       updateQty(row);
//     });
//   }

//   // Set total amount from DB response (matches what was saved)
//   document.getElementById("totalAmount").textContent =
//     data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";
//   calculateTotal(); // recalculate qty/items counts too
// }


// // ── On load ─────────────────────────────────────────────────────────────────
// window.addEventListener("DOMContentLoaded", () => {
//   // Start with 3 blank rows
//   for (let i = 0; i < 3; i++) addItemRow(false);
//   calculateTotal();
//   document.getElementById("sale_date").value = new Date().toISOString().slice(0, 10);
// });


// // ── PDF Download ─────────────────────────────────────────────────────────────
// function downloadInvoicePDF() {
//   const partyName  = document.getElementById("search_name").value.trim();
//   const saleDate   = document.getElementById("sale_date").value;
//   const invoiceId  = document.getElementById("current_sale_id").value;
//   const amount     = document.getElementById("totalAmount").textContent;
//   const totalQty   = document.getElementById("totalQtyCount").textContent;

//   if (!partyName) {
//     Swal.fire({ icon: "warning", title: "No Customer", text: "Please fill in the customer name before downloading." });
//     return;
//   }

//   // Gather items
//   const items = [];
//   document.querySelectorAll(".item-row").forEach((row, i) => {
//     const name   = getItemNameFromRow(row);
//     const price  = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const qty    = parseInt(row.querySelector(".qty-box")?.value) || 0;
//     const serials = Array.from(row.querySelectorAll(".serials input"))
//       .map(s => s.value.trim()).filter(Boolean);
//     if (name && qty > 0) items.push({ no: i + 1, name, price, qty, serials, subtotal: price * qty });
//   });

//   if (items.length === 0) {
//     Swal.fire({ icon: "warning", title: "Nothing to Export", text: "Add at least one item with serials and price." });
//     return;
//   }

//   // Use jsPDF
//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

//   const W = 210, PL = 14, PR = 196;
//   let y = 0;

//   // ── Header background ──
//   doc.setFillColor(30, 58, 95);
//   doc.rect(0, 0, W, 42, "F");

//   // Logo placeholder + title
//   doc.setTextColor(255, 255, 255);
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(22);
//   doc.text("SALE INVOICE", PL, 18);
//   doc.setFontSize(10);
//   doc.setFont("helvetica", "normal");
//   doc.text("Finance Management System", PL, 26);

//   // Invoice meta (top-right)
//   doc.setFontSize(9);
//   doc.text(`Invoice #: ${invoiceId || "DRAFT"}`, PR, 14, { align: "right" });
//   doc.text(`Date: ${saleDate || new Date().toLocaleDateString()}`, PR, 22, { align: "right" });
//   doc.text(`Customer: ${partyName}`, PR, 30, { align: "right" });

//   y = 52;

//   // ── Summary band ──
//   doc.setFillColor(239, 246, 255);
//   doc.rect(PL - 2, y - 6, W - (PL - 2) * 2, 12, "F");
//   doc.setTextColor(30, 58, 95);
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(9);
//   doc.text(`Total Qty: ${totalQty}   ·   Total Items: ${items.length}   ·   Invoice Amount: PKR ${amount}`, PL, y + 1);

//   y += 12;

//   // ── Table header ──
//   doc.setFillColor(37, 99, 235);
//   doc.rect(PL - 2, y, W - (PL - 2) * 2, 8, "F");
//   doc.setTextColor(255, 255, 255);
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(8);
//   doc.text("#",    PL,  y + 5.5);
//   doc.text("ITEM", PL + 10, y + 5.5);
//   doc.text("QTY",  PL + 80, y + 5.5);
//   doc.text("UNIT PRICE", PL + 100, y + 5.5);
//   doc.text("SUBTOTAL",   PR, y + 5.5, { align: "right" });

//   y += 10;

//   // ── Table rows ──
//   doc.setTextColor(30, 30, 30);
//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(8);

//   items.forEach((item, idx) => {
//     const rowH = 7 + Math.ceil(item.serials.length / 4) * 4;
//     if (y + rowH > 270) { doc.addPage(); y = 20; }

//     // Alternating row bg
//     if (idx % 2 === 0) {
//       doc.setFillColor(249, 250, 251);
//       doc.rect(PL - 2, y - 2, W - (PL - 2) * 2, rowH, "F");
//     }

//     doc.text(String(item.no), PL, y + 3.5);
//     doc.setFont("helvetica", "bold");
//     doc.text(item.name, PL + 10, y + 3.5);
//     doc.setFont("helvetica", "normal");
//     doc.text(String(item.qty), PL + 80, y + 3.5);
//     doc.text(`PKR ${item.price.toFixed(2)}`, PL + 100, y + 3.5);
//     doc.text(`PKR ${item.subtotal.toFixed(2)}`, PR, y + 3.5, { align: "right" });

//     // Serials in small gray text
//     if (item.serials.length) {
//       doc.setFontSize(7);
//       doc.setTextColor(107, 114, 128);
//       const chunks = [];
//       for (let i = 0; i < item.serials.length; i += 4) chunks.push(item.serials.slice(i, i+4).join("   "));
//       chunks.forEach((chunk, ci) => doc.text(chunk, PL + 10, y + 7 + ci * 4));
//       doc.setFontSize(8);
//       doc.setTextColor(30, 30, 30);
//     }

//     // Row separator
//     doc.setDrawColor(229, 231, 235);
//     doc.setLineWidth(0.2);
//     doc.line(PL - 2, y + rowH - 2, PR + 2, y + rowH - 2);

//     y += rowH;
//   });

//   // ── Total band ──
//   y += 4;
//   if (y > 260) { doc.addPage(); y = 20; }
//   doc.setFillColor(30, 58, 95);
//   doc.rect(PL - 2, y, W - (PL - 2) * 2, 10, "F");
//   doc.setTextColor(255, 255, 255);
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(10);
//   doc.text(`TOTAL AMOUNT:  PKR ${amount}`, PR, y + 7, { align: "right" });

//   // ── Footer ──
//   doc.setFontSize(7.5);
//   doc.setTextColor(150, 150, 150);
//   doc.setFont("helvetica", "normal");
//   doc.text("Generated by Finance Management System", W / 2, 290, { align: "center" });
//   doc.text(`Printed on ${new Date().toLocaleString()}`, W / 2, 294, { align: "center" });

//   const filename = invoiceId ? `Sale_Invoice_${invoiceId}.pdf` : `Sale_Invoice_DRAFT_${Date.now()}.pdf`;
//   doc.save(filename);
// }


// // ── Sale summary / history popup ─────────────────────────────────────────────
// async function fetchSaleSummary(from = null, to = null) {
//   try {
//     let url = "/sale/get-sale-summary/";
//     if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

//     const response = await fetch(url);
//     const data     = await response.json();

//     if (!data.success && !Array.isArray(data)) {
//       Swal.fire({ icon: "error", title: "Error", text: data.message || "Failed to fetch." });
//       return;
//     }

//     let rows = "";
//     if (Array.isArray(data) && data.length) {
//       data.forEach((sale, idx) => {
//         rows += `
//           <tr class="sale-row" data-vendor="${escapeHtml(sale.customer.toLowerCase())}"
//             onclick="viewSaleDetails(${sale.sales_invoice_id})"
//             style="cursor:pointer;">
//             <td>${idx + 1}</td>
//             <td><b>#${sale.sales_invoice_id}</b></td>
//             <td>${sale.invoice_date}</td>
//             <td>${escapeHtml(sale.customer)}</td>
//             <td style="text-align:right;font-family:'DM Mono',monospace;">
//               PKR ${parseFloat(sale.total_amount).toFixed(2)}
//             </td>
//           </tr>`;
//       });
//     } else {
//       rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
//     }

//     const html = `
//       <style>
//         .sh-search { width:100%;padding:9px 14px;margin-bottom:10px;border:1.5px solid #e5e7eb;
//           border-radius:9px;font-size:13px;outline:none;font-family:inherit; }
//         .sh-search:focus { border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.1); }
//         .sh-wrap { max-height:400px;overflow-y:auto;border-radius:8px; }
//         .sh-table { width:100%;border-collapse:collapse;font-size:13px; }
//         .sh-table th { background:#f9fafb;font-weight:700;color:#374151;
//           padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left; }
//         .sh-table td { padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151; }
//         .sh-table .sale-row:hover td { background:#eff6ff;color:#1d4ed8; }
//       </style>
//       <input type="text" class="sh-search" placeholder="🔍 Search by customer…" onkeyup="filterSaleTable(this.value)">
//       <div class="sh-wrap">
//         <table class="sh-table">
//           <thead><tr><th>#</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Amount</th></tr></thead>
//           <tbody id="saleSummaryBody">${rows}</tbody>
//         </table>
//       </div>
//     `;

//     function disableBg() {
//       document.querySelectorAll("input,textarea,select,[tabindex]").forEach(el => {
//         el.dataset.pt = el.getAttribute("tabindex");
//         el.setAttribute("tabindex", "-1");
//       });
//     }
//     function enableBg() {
//       document.querySelectorAll("input,textarea,select,[tabindex]").forEach(el => {
//         if (el.dataset.pt !== undefined) { el.setAttribute("tabindex", el.dataset.pt); delete el.dataset.pt; }
//         else el.removeAttribute("tabindex");
//       });
//     }

//     disableBg();
//     Swal.fire({
//       title: "📜 Sale History",
//       html, width: "720px",
//       confirmButtonText: "Close",
//       confirmButtonColor: "#2563eb",
//       focusConfirm: false,
//       allowOutsideClick: false,
//       allowEscapeKey: true,
//       didOpen: popup => {
//         document.querySelectorAll("input,textarea,select").forEach(el => el.blur());
//         popup.addEventListener("focusin",  e => e.stopPropagation());
//         popup.addEventListener("keydown",  e => e.stopPropagation());
//         setTimeout(() => {
//           const inp = popup.querySelector(".sh-search");
//           if (inp) { inp.focus(); inp.select(); }
//         }, 80);
//       },
//       willClose: enableBg,
//     });
//   } catch (err) {
//     Swal.fire({ icon: "error", title: "Network Error", text: err.message || "Cannot fetch history." });
//   }
// }

// function filterSaleTable(query) {
//   query = query.toLowerCase().trim();
//   document.querySelectorAll("#saleSummaryBody .sale-row").forEach(row => {
//     row.style.display = row.dataset.vendor.includes(query) ? "" : "none";
//   });
// }

// function saleHistory()   { fetchSaleSummary(); }
// function saleDateWise()  {
//   const today = new Date().toISOString().split("T")[0];
//   Swal.fire({
//     title: "📅 Select Date Range",
//     html: `
//       <div style="text-align:left;margin:8px 0;">
//         <label style="font-size:13px;color:#6b7280;">From Date</label>
//         <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:4px 0 12px;">
//         <label style="font-size:13px;color:#6b7280;">To Date</label>
//         <input type="date" id="toDate" class="swal2-input" style="width:100%;margin:4px 0;" value="${today}">
//       </div>
//     `,
//     focusConfirm: false,
//     showCancelButton: true,
//     confirmButtonText: "Fetch Sales",
//     confirmButtonColor: "#2563eb",
//     preConfirm: () => {
//       const f = document.getElementById("fromDate").value;
//       const t = document.getElementById("toDate").value;
//       if (!f || !t) { Swal.showValidationMessage("⚠️ Both dates are required"); return false; }
//       return { fromDate: f, toDate: t };
//     },
//   }).then(r => { if (r.isConfirmed) fetchSaleSummary(r.value.fromDate, r.value.toDate); });
// }

// function viewSaleDetails(saleID) {
//   document.getElementById("current_sale_id").value = saleID;
//   navigateSale("current");
//   Swal.close();
// }


/* ============================================================
   SALE PAGE — COMPLETE SCRIPT
   Features:
     - Item name auto-filled from serial (readonly display, never user-editable)
     - Unit price always starts at 0.00 (purchase price NOT shown)
     - Single-serial lookup + bulk paste from Excel
     - Duplicate serial guard (cross-row)
     - Total Qty + Total Items counters
     - PDF invoice download
     - Previous / Next / Current navigation
     - Sale history summary popup
   ============================================================ */

// ── Constants ──────────────────────────────────────────────────────────────
const SERIAL_SEPARATORS_RE = /[\r\n\t,;]+/;

// Per-serial lookup promise cache — avoids duplicate AJAX for same serial
const _serialLookupCache = new Map();


// ── Utilities ──────────────────────────────────────────────────────────────
function _norm(s) { return (s == null ? "" : String(s)).trim(); }

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function getCSRFToken() {
  for (const c of document.cookie.split(";").map(s => s.trim())) {
    if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
  }
  return null;
}


// ── Serial lookup (backend) ─────────────────────────────────────────────────
function fetchItemBySerial(serial) {
  serial = _norm(serial);
  if (!serial) return Promise.resolve({ success: false, message: "Empty serial." });
  if (_serialLookupCache.has(serial)) return _serialLookupCache.get(serial);
  const p = fetch(`/sale/lookup/${encodeURIComponent(serial)}/`, {
    method: "GET",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  }).then(r => r.json()).catch(() => ({ success: false, message: "Network error." }));
  _serialLookupCache.set(serial, p);
  return p;
}

function invalidateSerialCache(serial) {
  serial = _norm(serial);
  if (serial) _serialLookupCache.delete(serial);
}


// ── Duplicate detection ─────────────────────────────────────────────────────
// Returns a Map of  UPPER_SERIAL → input element  for every filled serial in
// the form EXCEPT the given input.
function collectAllSerials(exceptInput = null) {
  const map = new Map();
  document.querySelectorAll(".item-row .serials input").forEach(inp => {
    if (inp === exceptInput) return;
    const v = _norm(inp.value);
    if (!v) return;
    map.set(v.toUpperCase(), inp);
  });
  return map;
}


// ── Totals ─────────────────────────────────────────────────────────────────
function calculateTotal() {
  let amount = 0, totalQty = 0, itemCount = 0;
  document.querySelectorAll(".item-row").forEach(row => {
    const price = parseFloat(row.querySelector(".unit_price")?.value) || 0;
    const qty   = parseInt(row.querySelector(".qty-box")?.value)   || 0;
    amount   += price * qty;
    totalQty += qty;
    if (qty > 0 || price > 0) itemCount++;
  });
  document.getElementById("totalAmount").textContent     = amount.toFixed(2);
  document.getElementById("totalQtyCount").textContent   = totalQty;
  document.getElementById("totalItemsCount").textContent = itemCount;
}

function updateQty(row) {
  const inputs = row.querySelectorAll(".serials input");
  let count = 0;
  inputs.forEach(inp => { if (inp.value.trim()) count++; });
  row.querySelector(".qty-box").value = count;
  calculateTotal();
}


// ── Item-name display helper ───────────────────────────────────────────────
// The item_name field is a hidden <input> (for form submission).
// The visible element is a styled <div class="item-name-display">.
function setItemNameDisplay(row, name) {
  const hidden  = row.querySelector("input.item_name");
  const display = row.querySelector(".item-name-display");
  if (hidden)  hidden.value = name || "";
  if (display) {
    if (name && name.trim()) {
      display.textContent = name;
      display.classList.remove("empty");
    } else {
      display.innerHTML   = '<span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>';
      display.classList.add("empty");
    }
  }
}

function getItemNameFromRow(row) {
  const hidden = row.querySelector("input.item_name");
  return hidden ? _norm(hidden.value) : "";
}


// ── Serial commit handler ───────────────────────────────────────────────────
function handleSerialCommit(input, row) {
  const raw = _norm(input.value);
  if (!raw) { updateQty(row); return; }

  // Multi-value paste into a single input → redirect to bulk processor
  if (SERIAL_SEPARATORS_RE.test(raw)) {
    input.value = "";
    updateQty(row);
    processBulkSerialsText(raw, { preferRow: row });
    return;
  }

  // Duplicate check
  const existing = collectAllSerials(input);
  if (existing.has(raw.toUpperCase())) {
    Swal.fire({ icon: "warning", title: "Duplicate Serial",
      text: `Serial '${raw}' is already added to this invoice.` });
    input.value = "";
    updateQty(row);
    input.focus();
    return;
  }

  // Valid single serial — look up item
  input.classList.remove("serial-valid");
  fetchItemBySerial(raw).then(data => {
    if (!data || !data.success) {
      Swal.fire({ icon: "error", title: "Serial Not Found",
        text: (data && data.message) || `Serial '${raw}' could not be found in stock.` });
      invalidateSerialCache(raw);
      input.value = "";
      updateQty(row);
      input.focus();
      return;
    }

    const currentItem = getItemNameFromRow(row).toUpperCase();
    const fetchedItem = (data.item_name || "").toUpperCase();

    if (!currentItem) {
      // Empty row — adopt item
      setItemNameDisplay(row, data.item_name);
    } else if (currentItem !== fetchedItem) {
      // Wrong item — move serial to correct row
      input.value = "";
      updateQty(row);
      Swal.fire({ icon: "info", title: "Serial Belongs to Another Item",
        html: `Serial <b>${escapeHtml(raw)}</b> belongs to <b>${escapeHtml(data.item_name)}</b>, not this row.<br>It has been moved to the correct row.` });
      addSerialToItem(data.item_name, raw);
      return;
    }

    // ── PRICE: always 0.00, never auto-fill purchase price ──
    const priceInput = row.querySelector(".unit_price");
    if (priceInput && !priceInput.value) {
      priceInput.value = "0.00";
    }

    input.classList.add("serial-valid");
    updateQty(row);
    calculateTotal();
  });
}


// ── addSerialToItem — find or create a row for the given item, add serial ──
function addSerialToItem(itemName, serialValue) {
  const upperName = (itemName || "").toUpperCase();
  // Don't add if already present
  if (collectAllSerials().has(serialValue.toUpperCase())) return null;

  // Look for existing row with this item
  let targetRow = null;
  document.querySelectorAll(".item-row").forEach(r => {
    if (targetRow) return;
    if (getItemNameFromRow(r).toUpperCase() === upperName) targetRow = r;
  });

  if (!targetRow) {
    addItemRow(false);
    const rows = document.querySelectorAll(".item-row");
    targetRow = rows[rows.length - 1];
    setItemNameDisplay(targetRow, itemName);
    const priceInput = targetRow.querySelector(".unit_price");
    if (priceInput && !priceInput.value) priceInput.value = "0.00";
  }

  // Find first empty slot or add a new serial input
  let slot = null;
  targetRow.querySelectorAll(".serials input").forEach(inp => {
    if (!slot && !inp.value.trim()) slot = inp;
  });
  if (!slot) {
    addSerial(targetRow, false);
    const all = targetRow.querySelectorAll(".serials input");
    slot = all[all.length - 1];
  }
  slot.value = serialValue;
  slot.classList.add("serial-valid");
  updateQty(targetRow);
  calculateTotal();
  return targetRow;
}


// ── addSerial — create a serial input inside a row ──────────────────────────
function addSerial(row, autoFocus = true) {
  const serialsDiv = row.querySelector(".serials");
  const input = document.createElement("input");
  input.type        = "text";
  input.placeholder = "Enter serial…";
  input.oninput     = () => updateQty(row);
  input.onkeydown   = (e) => handleEnterKey(e, input);

  // Commit on blur or Enter
  input.addEventListener("change", () => handleSerialCommit(input, row));

  // Multi-line paste interception
  input.addEventListener("paste", e => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && SERIAL_SEPARATORS_RE.test(text)) {
      e.preventDefault();
      input.value = "";
      updateQty(row);
      processBulkSerialsText(text, { preferRow: row });
    }
  });

  serialsDiv.appendChild(input);
  updateQty(row);
  if (autoFocus) input.focus();
}


// ── removeSerial ────────────────────────────────────────────────────────────
function removeSerial(row) {
  const serialsDiv = row.querySelector(".serials");
  if (serialsDiv.lastChild) {
    serialsDiv.removeChild(serialsDiv.lastChild);
    updateQty(row);
    const remaining = serialsDiv.querySelectorAll("input");
    if (remaining.length) remaining[remaining.length - 1].focus();
    else row.querySelector(".add-serial").focus();
  }
}


// ── addItemRow — create a new blank item row ─────────────────────────────────
function addItemRow(shouldFocus = true) {
  const itemsDiv = document.getElementById("items");
  const row = document.createElement("div");
  row.className = "item-row";

  row.innerHTML = `
    <!-- Item name: hidden input for submission + visible display div -->
    <div class="item_name_field">
      <input type="text" class="item_name" value="" style="display:none;" autocomplete="off">
      <div class="item-name-display empty">
        <span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>
      </div>
    </div>

    <!-- Unit price -->
    <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00" value="">

    <!-- Qty (read-only, auto-counted) -->
    <input type="number" class="qty-box" readonly value="0">

    <!-- Empty col (aligns with col-header gap) -->
    <div></div>

    <!-- Serials -->
    <div class="serials"></div>

    <!-- Row-level action buttons -->
    <div class="row-actions">
      <button type="button" class="custom-btn add-serial">＋ Serial</button>
      <button type="button" class="custom-btn remove-serial">− Serial</button>
      <button type="button" class="custom-btn remove-item">✕ Remove</button>
    </div>
  `;

  row.querySelector(".add-serial").onclick  = () => addSerial(row);
  row.querySelector(".remove-serial").onclick = () => removeSerial(row);
  row.querySelector(".remove-item").onclick = () => { row.remove(); calculateTotal(); };
  row.querySelector(".unit_price").oninput  = () => calculateTotal();

  itemsDiv.appendChild(row);

  // First serial input (no autofocus on initial load)
  addSerial(row, false);

  if (shouldFocus) {
    // Focus the first serial input since item name is auto-filled
    const firstSerial = row.querySelector(".serials input");
    if (firstSerial) firstSerial.focus();
  }
}


// ── Bulk serial dialog ───────────────────────────────────────────────────────
function openBulkSerialsDialog() {
  Swal.fire({
    title: "📋 Bulk Paste Serials",
    html: `
      <div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
        Paste serial numbers separated by <b>newline, tab, comma, or semicolon</b>.<br>
        Works directly with Excel column copy (Ctrl+C → Ctrl+V).
      </div>
      <textarea id="bulkSerialsTextarea"
        style="width:100%;min-height:200px;padding:12px;font-family:'DM Mono',monospace;
               font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;
               background:#f9fafb;color:#111827;"
        placeholder="SN001&#10;SN002&#10;SN003&#10;…"></textarea>
      <div style="margin-top:8px;font-size:12px;color:#9ca3af;">
        Items will be grouped by their item type automatically.
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Process Serials",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#2563eb",
    focusConfirm: false,
    width: "540px",
    preConfirm: () => {
      const ta   = document.getElementById("bulkSerialsTextarea");
      const text = (ta && ta.value) || "";
      if (!text.trim()) {
        Swal.showValidationMessage("⚠️ Please paste at least one serial number.");
        return false;
      }
      return text;
    },
    didOpen: () => {
      const ta = document.getElementById("bulkSerialsTextarea");
      if (ta) ta.focus();
    },
  }).then(res => {
    if (res.isConfirmed && res.value) processBulkSerialsText(res.value);
  });
}


// ── Process bulk serial text ─────────────────────────────────────────────────
function processBulkSerialsText(rawText, { preferRow = null } = {}) {
  if (!rawText || !rawText.trim()) return;

  // Show loading
  Swal.fire({ title: "Processing serials…", allowOutsideClick: false,
    didOpen: () => Swal.showLoading() });

  fetch("/sale/bulk-lookup/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify({ raw: rawText }),
  }).then(r => r.json()).then(data => {
    Swal.close();

    if (!data || !data.success) {
      Swal.fire({ icon: "error", title: "Bulk Lookup Failed",
        text: (data && data.message) || "Unable to process pasted serials." });
      return;
    }

    const existing          = collectAllSerials();
    const accepted          = [];
    const skippedDuplicates = [];
    const invalid           = Array.isArray(data.invalid) ? data.invalid.slice() : [];

    // Duplicates collapsed by the server (within the pasted text itself) are
    // never included in data.groups, so we derive the count from the totals:
    //   intra-paste dupes = total_input - unique_after_dedup - invalid_count
    const intraPasteDupes = Math.max(
      0,
      (data.total_input || 0) - (data.unique || 0) - invalid.length
    );

    (data.groups || []).forEach(group => {
      const fresh = [];
      group.serials.forEach(s => {
        const key = s.toUpperCase();
        if (existing.has(key)) { skippedDuplicates.push(s); }
        else { existing.set(key, true); fresh.push(s); }
      });
      if (!fresh.length) return;

      // Try to adopt the preferRow if it's still empty
      let targetRow = null;
      if (preferRow && preferRow.isConnected &&
          !getItemNameFromRow(preferRow).trim() && !accepted.length) {
        targetRow = preferRow;
        setItemNameDisplay(targetRow, group.item_name);
        const pr = targetRow.querySelector(".unit_price");
        if (pr && !pr.value) pr.value = "0.00";
      }

      fresh.forEach(s => {
        if (targetRow) {
          let slot = null;
          targetRow.querySelectorAll(".serials input").forEach(inp => {
            if (!slot && !inp.value.trim()) slot = inp;
          });
          if (!slot) {
            addSerial(targetRow, false);
            const all = targetRow.querySelectorAll(".serials input");
            slot = all[all.length - 1];
          }
          slot.value = s;
          slot.classList.add("serial-valid");
          updateQty(targetRow);
        } else {
          addSerialToItem(group.item_name, s);
        }
        accepted.push(s);
      });
    });

    calculateTotal();

    // Build summary popup
    const invalidHtml = invalid.length ? `
      <details style="margin-top:10px;text-align:left;">
        <summary style="cursor:pointer;color:#dc2626;font-size:13px;">
          ❌ Show ${invalid.length} invalid serial${invalid.length>1?"s":""}
        </summary>
        <ul style="max-height:160px;overflow:auto;margin:6px 0 0 16px;padding:0;font-size:12px;color:#374151;">
          ${invalid.map(i=>`<li><code>${escapeHtml(i.serial)}</code> — ${escapeHtml(i.reason)}</li>`).join("")}
        </ul>
      </details>` : "";

    const totalDupes = skippedDuplicates.length + intraPasteDupes;
    const dupHtml = totalDupes ? `
      <details style="margin-top:8px;text-align:left;">
        <summary style="cursor:pointer;color:#d97706;font-size:13px;">
          ⚠️ Show ${totalDupes} duplicate${totalDupes>1?"s":""}
          ${intraPasteDupes ? `(${intraPasteDupes} within pasted text, ${skippedDuplicates.length} already in form)` : ""}
        </summary>
        <ul style="max-height:120px;overflow:auto;margin:6px 0 0 16px;padding:0;font-size:12px;color:#374151;">
          ${intraPasteDupes ? `<li style="color:#92400e;"><i>${intraPasteDupes} duplicate(s) removed from pasted text</i></li>` : ""}
          ${skippedDuplicates.map(s=>`<li><code>${escapeHtml(s)}</code> — already in form</li>`).join("")}
        </ul>
      </details>` : "";

    Swal.fire({
      icon: accepted.length ? (invalid.length?"warning":"success") : "error",
      title: "Bulk Serial Result",
      html: `
        <div style="text-align:left;line-height:1.8;font-size:14px;">
          <div>📥 Total pasted: <b>${data.total_input}</b></div>
          <div>✅ Added to invoice: <b style="color:#16a34a;">${accepted.length}</b></div>
          <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${totalDupes}</b></div>
          <div>❌ Invalid / not in stock: <b style="color:#dc2626;">${invalid.length}</b></div>
          ${dupHtml}${invalidHtml}
        </div>
      `,
    });
  }).catch(() => {
    Swal.close();
    Swal.fire({ icon: "error", title: "Network Error", text: "Could not contact server." });
  });
}


// ── Build & Submit ───────────────────────────────────────────────────────────
function buildAndSubmit(event) {
  event.preventDefault();
  const form   = event.target;
  const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

  const partyName   = document.getElementById("search_name").value.trim();
  let   saleDate    = document.getElementById("sale_date").value;
  if (!saleDate) saleDate = new Date().toISOString().slice(0, 10);

  if (!partyName) {
    Swal.fire({ icon: "warning", title: "Missing Customer",
      text: "Please select a customer / party name before saving." });
    document.getElementById("search_name").focus();
    return;
  }

  const items = [];
  document.querySelectorAll(".item-row").forEach(row => {
    const item_name  = getItemNameFromRow(row);
    const unit_price = parseFloat(row.querySelector(".unit_price").value);
    const serials    = Array.from(row.querySelectorAll(".serials input"))
      .map(s => s.value.trim()).filter(Boolean);
    const qty = serials.length;
    if (item_name && qty > 0 && !isNaN(unit_price) && unit_price > 0) {
      items.push({ item_name, qty, unit_price, serials });
    }
  });

  if (items.length === 0) {
    Swal.fire({ icon: "warning", title: "No Valid Items",
      text: "Add at least one item row with a serial number and a price > 0." });
    return;
  }

  const currentId = document.getElementById("current_sale_id").value || null;
  const description = (document.getElementById("sale_description")?.value || "").trim();
  const payload   = { sale_id: currentId, party_name: partyName,
                      sale_date: saleDate, items, action, description };

  _submitSale(payload);
}

function _submitSale(payload) {
  fetch("/sale/sales/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify(payload),
  })
  .then(async res => {
    if (!res.ok) {
      let msg = "Server error.";
      try { const e = await res.json(); if (e.message) msg = e.message; } catch {}
      throw new Error(msg);
    }
    return res.json();
  })
  .then(data => {
    if (data.confirm) {
      Swal.fire({ icon: "warning", title: "Confirm Sale",
        text: data.message || "Selling price ≤ buying price. Continue?",
        showCancelButton: true, confirmButtonText: "Yes, proceed",
        cancelButtonText: "Cancel", confirmButtonColor: "#2563eb" })
      .then(r => {
        if (r.isConfirmed) { payload.force = true; _submitSale(payload); }
      });
    } else if (data.success) {
      Swal.fire({ icon: "success", title: "Success",
        text: data.message || "Sale saved successfully.",
        timer: 1600, showConfirmButton: false })
      .then(() => window.location.reload());
    } else {
      Swal.fire({ icon: "error", title: "Error",
        text: data.message || "Something went wrong." });
    }
  })
  .catch(err => {
    Swal.fire({ icon: "error", title: "Submission Failed",
      text: err.message || "An unexpected error occurred." });
  });
}


// ── Delete confirmation ──────────────────────────────────────────────────────
const deleteButton = document.querySelector(".delete-btn");

function confirmDelete(event) {
  event.preventDefault();
  Swal.fire({
    title: "Delete this Sale?",
    text: "This action cannot be undone.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#6b7280",
    confirmButtonText: "Yes, delete",
    cancelButtonText: "Cancel",
  }).then(result => {
    if (result.isConfirmed) {
      deleteButton.removeEventListener("click", confirmDelete);
      deleteButton.click();
      setTimeout(() => deleteButton.addEventListener("click", confirmDelete), 120);
    }
  });
}
if (deleteButton) deleteButton.addEventListener("click", confirmDelete);

document.querySelectorAll('button[type="submit"]').forEach(btn => {
  btn.addEventListener("click", function () {
    document.querySelectorAll('button[type="submit"]').forEach(b => b.removeAttribute("clicked"));
    this.setAttribute("clicked", "true");
  });
});


// ── Enter-key navigation ─────────────────────────────────────────────────────
function handleEnterKey(e, input) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (!input.value.trim()) { input.focus(); return; }
  const all = Array.from(document.querySelectorAll(
    "input:not([readonly]):not([style*='display:none']):not([style*='display: none']), select"
  ));
  const idx = all.indexOf(input);
  if (idx > -1 && idx < all.length - 1) all[idx + 1].focus();
}


// ── Party autocomplete ───────────────────────────────────────────────────────
$(document).ready(function () {
  let autocompleteUrl  = $("#search_name").data("autocomplete-url");
  let selectedIndex    = -1;

  $("#search_name").on("input", function () {
    const query        = $(this).val();
    const suggestionsBox = $("#suggestions");
    selectedIndex = -1;

    if (query.length >= 1) {
      $.ajax({ url: autocompleteUrl, data: { term: query }, dataType: "json",
        success: function (data) {
          suggestionsBox.empty();
          if (data.length) {
            data.forEach(party => {
              $("<div>").addClass("suggestion-item").text(party)
                .appendTo(suggestionsBox)
                .on("click", function () {
                  $("#search_name").val(party);
                  suggestionsBox.hide();
                  // Focus first serial input
                  const firstSerial = document.querySelector(".item-row .serials input");
                  if (firstSerial) firstSerial.focus();
                });
            });
            suggestionsBox.show();
          } else { suggestionsBox.hide(); }
        },
      });
    } else { suggestionsBox.hide(); }
  });

  $("#search_name").on("keydown", function (e) {
    const items = $("#suggestions .suggestion-item");
    if (!items.length) return;
    if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault(); selectedIndex = (selectedIndex+1) % items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); selectedIndex = (selectedIndex-1+items.length) % items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault(); items.eq(selectedIndex).trigger("click");
    }
  });

  $(document).on("click", e => {
    if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
  });
});


// ── Navigate sale invoices ───────────────────────────────────────────────────
async function navigateSale(action) {
  try {
    const currentId = document.getElementById("current_sale_id").value || "";
    const response  = await fetch(
      `/sale/get-sale/?action=${action}&current_id=${currentId}`,
      { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest" } }
    );
    let data = await response.json();
    if (data.success === false) {
      Swal.fire({ icon: "info", title: "Navigation", text: data.message || "No sale found." });
      return;
    }
    if (typeof data === "string") data = JSON.parse(data);
    if (typeof data === "object" && !data.hasOwnProperty("sales_invoice_id")) {
      try { data = JSON.parse(Object.values(data)[0]); } catch {}
    }
    renderSaleData(data);
  } catch (err) {
    Swal.fire({ icon: "error", title: "Error", text: "Failed to fetch sale data." });
  }
}

function renderSaleData(data) {
  document.getElementById("search_name").value       = data.Party || "";
  document.getElementById("sale_date").value         = data.invoice_date || "";
  document.getElementById("current_sale_id").value   = data.sales_invoice_id || "";
  const _descEl = document.getElementById("sale_description");
  if (_descEl) _descEl.value = data.description || "";

  // Update badge
  const badge = document.getElementById("invoiceIdBadge");
  if (badge) badge.textContent = data.sales_invoice_id ? `#${data.sales_invoice_id}` : "#NEW";

  // Update "Entry by" badge
  const entryByName = document.getElementById("entryByName");
  if (entryByName) {
    entryByName.textContent = data.created_by || "—";
  }

  // Update save button label
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.innerHTML = data.sales_invoice_id
      ? '<i class="fa-solid fa-pen-to-square"></i> Update Sale'
      : '<i class="fa-solid fa-floppy-disk"></i> Save Sale';
  }

  // Rebuild items
  const itemsDiv = document.getElementById("items");
  itemsDiv.innerHTML = "";

  if (Array.isArray(data.items)) {
    data.items.forEach(item => {
      const row       = document.createElement("div");
      row.className   = "item-row";
      row.innerHTML   = `
        <div class="item_name_field">
          <input type="text" class="item_name" value="${escapeHtml(item.item_name||"")}" style="display:none;" autocomplete="off">
          <div class="item-name-display ${item.item_name?'':'empty'}">
            ${item.item_name ? escapeHtml(item.item_name) : '<span style="font-style:italic;color:#9ca3af;">— awaiting serial —</span>'}
          </div>
        </div>
        <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00" value="${item.unit_price || 0}">
        <input type="number" class="qty-box" readonly value="${item.qty || 0}">
        <div></div>
        <div class="serials"></div>
        <div class="row-actions">
          <button type="button" class="custom-btn add-serial">＋ Serial</button>
          <button type="button" class="custom-btn remove-serial">− Serial</button>
          <button type="button" class="custom-btn remove-item">✕ Remove</button>
        </div>
      `;

      row.querySelector(".add-serial").onclick    = () => addSerial(row);
      row.querySelector(".remove-serial").onclick = () => removeSerial(row);
      row.querySelector(".remove-item").onclick   = () => { row.remove(); calculateTotal(); };
      row.querySelector(".unit_price").oninput    = () => calculateTotal();

      const serialsDiv = row.querySelector(".serials");
      if (Array.isArray(item.serials)) {
        item.serials.forEach(serial => {
          const inp       = document.createElement("input");
          inp.type        = "text";
          inp.placeholder = "Serial";
          inp.value       = serial;
          inp.classList.add("serial-valid");
          inp.oninput     = () => updateQty(row);
          inp.onkeydown   = e => handleEnterKey(e, inp);
          inp.addEventListener("change", () => handleSerialCommit(inp, row));
          inp.addEventListener("paste", e => {
            const text = (e.clipboardData||window.clipboardData).getData("text");
            if (text && SERIAL_SEPARATORS_RE.test(text)) {
              e.preventDefault(); inp.value=""; updateQty(row);
              processBulkSerialsText(text, { preferRow: row });
            }
          });
          serialsDiv.appendChild(inp);
        });
      }

      itemsDiv.appendChild(row);
      updateQty(row);
    });
  }

  // Set total amount from DB response (matches what was saved)
  document.getElementById("totalAmount").textContent =
    data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";
  calculateTotal(); // recalculate qty/items counts too
}


// ── On load ─────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Start with 3 blank rows
  for (let i = 0; i < 3; i++) addItemRow(false);
  calculateTotal();
  document.getElementById("sale_date").value = new Date().toISOString().slice(0, 10);
});


// ── PDF Download ─────────────────────────────────────────────────────────────
function downloadInvoicePDF() {
  const partyName  = document.getElementById("search_name").value.trim();
  const saleDate   = document.getElementById("sale_date").value;
  const invoiceId  = document.getElementById("current_sale_id").value;
  const amount     = document.getElementById("totalAmount").textContent;
  const totalQty   = document.getElementById("totalQtyCount").textContent;

  if (!partyName) {
    Swal.fire({ icon: "warning", title: "No Customer", text: "Please fill in the customer name before downloading." });
    return;
  }

  // Gather items
  const items = [];
  document.querySelectorAll(".item-row").forEach((row, i) => {
    const name   = getItemNameFromRow(row);
    const price  = parseFloat(row.querySelector(".unit_price")?.value) || 0;
    const qty    = parseInt(row.querySelector(".qty-box")?.value) || 0;
    const serials = Array.from(row.querySelectorAll(".serials input"))
      .map(s => s.value.trim()).filter(Boolean);
    if (name && qty > 0) items.push({ no: i + 1, name, price, qty, serials, subtotal: price * qty });
  });

  if (items.length === 0) {
    Swal.fire({ icon: "warning", title: "Nothing to Export", text: "Add at least one item with serials and price." });
    return;
  }

  // Use jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, PL = 14, PR = 196;
  let y = 0;

  // ── Header background ──
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, W, 42, "F");

  // Logo placeholder + title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("SALE INVOICE", PL, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Financee Accounting System", PL, 26);

  // Invoice meta (top-right)
  doc.setFontSize(9);
  doc.text(`Invoice #: ${invoiceId || "DRAFT"}`, PR, 14, { align: "right" });
  doc.text(`Date: ${saleDate || new Date().toLocaleDateString()}`, PR, 22, { align: "right" });
  doc.text(`Customer: ${partyName}`, PR, 30, { align: "right" });

  y = 52;

  // ── Summary band ──
  doc.setFillColor(239, 246, 255);
  doc.rect(PL - 2, y - 6, W - (PL - 2) * 2, 12, "F");
  doc.setTextColor(30, 58, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total Qty: ${totalQty}   ·   Total Items: ${items.length}   ·   Invoice Amount: PKR ${amount}`, PL, y + 1);

  y += 12;

  // ── Table header ──
  doc.setFillColor(37, 99, 235);
  doc.rect(PL - 2, y, W - (PL - 2) * 2, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("#",    PL,  y + 5.5);
  doc.text("ITEM", PL + 10, y + 5.5);
  doc.text("QTY",  PL + 80, y + 5.5);
  doc.text("UNIT PRICE", PL + 100, y + 5.5);
  doc.text("SUBTOTAL",   PR, y + 5.5, { align: "right" });

  y += 10;

  // ── Table rows ──
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  items.forEach((item, idx) => {
    const rowH = 7 + Math.ceil(item.serials.length / 4) * 4;
    if (y + rowH > 270) { doc.addPage(); y = 20; }

    // Alternating row bg
    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(PL - 2, y - 2, W - (PL - 2) * 2, rowH, "F");
    }

    doc.text(String(item.no), PL, y + 3.5);
    doc.setFont("helvetica", "bold");
    doc.text(item.name, PL + 10, y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.text(String(item.qty), PL + 80, y + 3.5);
    doc.text(`PKR ${item.price.toFixed(2)}`, PL + 100, y + 3.5);
    doc.text(`PKR ${item.subtotal.toFixed(2)}`, PR, y + 3.5, { align: "right" });

    // Serials in small gray text
    if (item.serials.length) {
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      const chunks = [];
      for (let i = 0; i < item.serials.length; i += 4) chunks.push(item.serials.slice(i, i+4).join("   "));
      chunks.forEach((chunk, ci) => doc.text(chunk, PL + 10, y + 7 + ci * 4));
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
    }

    // Row separator
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(PL - 2, y + rowH - 2, PR + 2, y + rowH - 2);

    y += rowH;
  });

  // ── Total band ──
  y += 4;
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFillColor(30, 58, 95);
  doc.rect(PL - 2, y, W - (PL - 2) * 2, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`TOTAL AMOUNT:  PKR ${amount}`, PR, y + 7, { align: "right" });

  // ── Footer ──
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.text("Generated by Financee Developed by Maaz Rehan", W / 2, 290, { align: "center" });
  doc.text(`Printed on ${new Date().toLocaleString()}`, W / 2, 294, { align: "center" });

  const filename = invoiceId ? `Sale_Invoice_${invoiceId}.pdf` : `Sale_Invoice_DRAFT_${Date.now()}.pdf`;
  doc.save(filename);
}


// ── Sale summary / history popup ─────────────────────────────────────────────
async function fetchSaleSummary(from = null, to = null) {
  try {
    let url = "/sale/get-sale-summary/";
    if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const response = await fetch(url);
    const data     = await response.json();

    if (!data.success && !Array.isArray(data)) {
      Swal.fire({ icon: "error", title: "Error", text: data.message || "Failed to fetch." });
      return;
    }

    let rows = "";
    if (Array.isArray(data) && data.length) {
      data.forEach((sale, idx) => {
        rows += `
          <tr class="sale-row" data-vendor="${escapeHtml(sale.customer.toLowerCase())}"
            onclick="viewSaleDetails(${sale.sales_invoice_id})"
            style="cursor:pointer;">
            <td>${idx + 1}</td>
            <td><b>#${sale.sales_invoice_id}</b></td>
            <td>${sale.invoice_date}</td>
            <td>${escapeHtml(sale.customer)}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;">
              PKR ${parseFloat(sale.total_amount).toFixed(2)}
            </td>
          </tr>`;
      });
    } else {
      rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
    }

    const html = `
      <style>
        .sh-search { width:100%;padding:9px 14px;margin-bottom:10px;border:1.5px solid #e5e7eb;
          border-radius:9px;font-size:13px;outline:none;font-family:inherit; }
        .sh-search:focus { border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.1); }
        .sh-wrap { max-height:400px;overflow-y:auto;border-radius:8px; }
        .sh-table { width:100%;border-collapse:collapse;font-size:13px; }
        .sh-table th { background:#f9fafb;font-weight:700;color:#374151;
          padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left; }
        .sh-table td { padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151; }
        .sh-table .sale-row:hover td { background:#eff6ff;color:#1d4ed8; }
      </style>
      <input type="text" class="sh-search" placeholder="🔍 Search by customer…" onkeyup="filterSaleTable(this.value)">
      <div class="sh-wrap">
        <table class="sh-table">
          <thead><tr><th>#</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Amount</th></tr></thead>
          <tbody id="saleSummaryBody">${rows}</tbody>
        </table>
      </div>
    `;

    function disableBg() {
      document.querySelectorAll("input,textarea,select,[tabindex]").forEach(el => {
        el.dataset.pt = el.getAttribute("tabindex");
        el.setAttribute("tabindex", "-1");
      });
    }
    function enableBg() {
      document.querySelectorAll("input,textarea,select,[tabindex]").forEach(el => {
        if (el.dataset.pt !== undefined) { el.setAttribute("tabindex", el.dataset.pt); delete el.dataset.pt; }
        else el.removeAttribute("tabindex");
      });
    }

    disableBg();
    Swal.fire({
      title: "📜 Sale History",
      html, width: "720px",
      confirmButtonText: "Close",
      confirmButtonColor: "#2563eb",
      focusConfirm: false,
      allowOutsideClick: false,
      allowEscapeKey: true,
      didOpen: popup => {
        document.querySelectorAll("input,textarea,select").forEach(el => el.blur());
        popup.addEventListener("focusin",  e => e.stopPropagation());
        popup.addEventListener("keydown",  e => e.stopPropagation());
        setTimeout(() => {
          const inp = popup.querySelector(".sh-search");
          if (inp) { inp.focus(); inp.select(); }
        }, 80);
      },
      willClose: enableBg,
    });
  } catch (err) {
    Swal.fire({ icon: "error", title: "Network Error", text: err.message || "Cannot fetch history." });
  }
}

function filterSaleTable(query) {
  query = query.toLowerCase().trim();
  document.querySelectorAll("#saleSummaryBody .sale-row").forEach(row => {
    row.style.display = row.dataset.vendor.includes(query) ? "" : "none";
  });
}

function saleHistory()   { fetchSaleSummary(); }
function saleDateWise()  {
  const today = new Date().toISOString().split("T")[0];
  Swal.fire({
    title: "📅 Select Date Range",
    html: `
      <div style="text-align:left;margin:8px 0;">
        <label style="font-size:13px;color:#6b7280;">From Date</label>
        <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:4px 0 12px;">
        <label style="font-size:13px;color:#6b7280;">To Date</label>
        <input type="date" id="toDate" class="swal2-input" style="width:100%;margin:4px 0;" value="${today}">
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Fetch Sales",
    confirmButtonColor: "#2563eb",
    preConfirm: () => {
      const f = document.getElementById("fromDate").value;
      const t = document.getElementById("toDate").value;
      if (!f || !t) { Swal.showValidationMessage("⚠️ Both dates are required"); return false; }
      return { fromDate: f, toDate: t };
    },
  }).then(r => { if (r.isConfirmed) fetchSaleSummary(r.value.fromDate, r.value.toDate); });
}

function viewSaleDetails(saleID) {
  document.getElementById("current_sale_id").value = saleID;
  navigateSale("current");
  Swal.close();
}