/* ============================================================
   Opening Stock — onboarding / data migration page
   Item-row UX mirrors the Purchase section: per-serial comments,
   bulk paste, live duplicate/stock validation, and keyboard-
   navigable autocomplete for vendor and item fields.
   ============================================================ */
(function () {
  "use strict";

  const U = window.OS_URLS || {};
  const PERMS = window.OS_PERMS || {};
  const ITEM_URL = window.OS_AUTOCOMPLETE_ITEM_URL || "";
  const SERIAL_SEP_RE = /[\r\n\t,;]+/;

  // ---- helpers ----------------------------------------------------------
  function _norm(s) { return (s == null ? "" : String(s)).trim(); }
  function getCookie(name) {
    const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return m ? decodeURIComponent(m.pop()) : "";
  }
  function csrf() {
    const inp = document.querySelector("input[name=csrfmiddlewaretoken]");
    return (inp && inp.value) || getCookie("csrftoken");
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: JSON.stringify(body || {}),
    }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
  }
  function highlightMatch(text, query) {
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<strong>" + esc(text.slice(i, i + query.length)) + "</strong>" + esc(text.slice(i + query.length));
  }

  // ---- generic keyboard-navigable autocomplete --------------------------
  // box is a container that will hold .suggestion-item children.
  function setupAutocomplete(input, box, url, onSelect) {
    let timer = null;
    let idx = -1;

    function items() { return Array.from(box.querySelectorAll(".suggestion-item")); }
    function clear() { box.innerHTML = ""; box.style.display = "none"; idx = -1; }
    function move(delta) {
      const its = items();
      if (!its.length) return;
      idx = (idx + delta + its.length) % its.length;
      its.forEach((el) => el.classList.remove("highlight"));
      its[idx].classList.add("highlight");
      its[idx].scrollIntoView({ block: "nearest" });
    }
    function choose(el) {
      input.value = el.dataset.value;
      clear();
      if (onSelect) onSelect(el.dataset.value);
    }

    input.addEventListener("input", function () {
      const q = _norm(input.value);
      clearTimeout(timer);
      if (q.length < 1) { clear(); return; }
      timer = setTimeout(() => {
        fetch(url + "?term=" + encodeURIComponent(q))
          .then((r) => r.json())
          .then((list) => {
            if (!Array.isArray(list) || !list.length) { clear(); return; }
            box.innerHTML = list.map((name) =>
              `<div class="suggestion-item" data-value="${esc(name)}">${highlightMatch(name, q)}</div>`).join("");
            box.style.display = "block";
            idx = -1;
          }).catch(clear);
      }, 160);
    });

    input.addEventListener("keydown", function (e) {
      const its = items();
      if (!its.length || box.style.display === "none") return;
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        if (idx >= 0 && its[idx]) { e.preventDefault(); choose(its[idx]); }
      } else if (e.key === "Escape") { clear(); }
    });

    box.addEventListener("mousedown", function (e) {
      const el = e.target.closest(".suggestion-item");
      if (el) { e.preventDefault(); choose(el); }
    });
    input.addEventListener("blur", () => setTimeout(clear, 150));
  }

  // ---- totals -----------------------------------------------------------
  function calculateTotal() {
    const rows = document.querySelectorAll("#items .item-row");
    let items = 0, units = 0, cost = 0;
    rows.forEach((row) => {
      const price = parseFloat(row.querySelector(".unit_price").value) || 0;
      const qty = Array.from(row.querySelectorAll(".serials .sn")).filter((i) => i.value.trim()).length;
      const name = _norm(row.querySelector(".item_name").value);
      if (name || qty) items += 1;
      units += qty;
      cost += price * qty;
    });
    document.getElementById("totalItemsCount").textContent = items;
    document.getElementById("totalQtyCount").textContent = units;
    document.getElementById("totalAmount").textContent = fmt(cost);
  }

  function updateQty(row) {
    const filled = Array.from(row.querySelectorAll(".serials .sn")).filter((i) => i.value.trim()).length;
    row.querySelector(".qty-box").value = filled;
    calculateTotal();
  }

  // ---- cross-row serial collection + validation -------------------------
  function collectAllSNs(except) {
    const map = new Map();
    document.querySelectorAll("#items .item-row .serials .sn").forEach((inp) => {
      if (inp === except) return;
      const v = _norm(inp.value);
      if (v) map.set(v.toUpperCase(), inp);
    });
    return map;
  }

  function checkSerialsWithBackend(serials) {
    if (!serials.length || !U.checkSerials) return Promise.resolve({});
    return fetch(U.checkSerials, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: JSON.stringify({ serials }),
    }).then((r) => r.json()).then((data) => {
      if (!data.success) return {};
      const out = {};
      for (const [k, v] of Object.entries(data.results || {})) out[k.toUpperCase()] = v;
      return out;
    }).catch(() => ({}));
  }

  function applySerialStatus(snInput, tagEl, status) {
    snInput.classList.remove("dup-self", "dup-stock", "dup-existed", "dup-ok");
    tagEl.textContent = "";
    tagEl.className = "serial-status-tag";
    switch (status) {
      case "ok": snInput.classList.add("dup-ok"); break;
      case "dup": snInput.classList.add("dup-self"); tagEl.textContent = "Duplicate"; tagEl.classList.add("tag-dup"); break;
      case "in_stock": snInput.classList.add("dup-stock"); tagEl.textContent = "In Stock!"; tagEl.classList.add("tag-stock"); break;
      case "ever_existed": snInput.classList.add("dup-existed"); tagEl.textContent = "Prev. System"; tagEl.classList.add("tag-existed"); break;
      default: break;
    }
  }

  function revalidateRowSerials(row) {
    const pairs = Array.from(row.querySelectorAll(".serial-pair"));
    if (!pairs.length) return;
    const rowSNs = new Set(Array.from(row.querySelectorAll(".sn")).map((i) => i.value.trim().toUpperCase()).filter(Boolean));
    const formSerials = new Map([...collectAllSNs()].filter(([k]) => !rowSNs.has(k)));
    const seenInRow = new Map();
    const toCheck = [];

    pairs.forEach((pair) => {
      const snInput = pair.querySelector(".sn");
      const tagEl = pair.querySelector(".serial-status-tag");
      const v = _norm(snInput.value);
      if (!v) { applySerialStatus(snInput, tagEl, ""); return; }
      const vUp = v.toUpperCase();
      if (seenInRow.has(vUp) || formSerials.has(vUp)) {
        applySerialStatus(snInput, tagEl, "dup");
      } else {
        seenInRow.set(vUp, snInput);
        toCheck.push({ serial: v, snInput, tagEl });
      }
    });
    if (!toCheck.length) return;
    checkSerialsWithBackend(toCheck.map((t) => t.serial)).then((results) => {
      toCheck.forEach(({ serial, snInput, tagEl }) => {
        const r = results[serial.toUpperCase()];
        if (r) applySerialStatus(snInput, tagEl, r.status);
      });
    });
  }

  // ---- serial pairs -----------------------------------------------------
  function addSerialPair(row, serialValue = "", commentValue = "All Ok", autoFocus = true) {
    const serialsDiv = row.querySelector(".serials");
    const pair = document.createElement("div");
    pair.className = "serial-pair";

    const snInput = document.createElement("input");
    snInput.type = "text"; snInput.className = "sn"; snInput.placeholder = "Serial number…"; snInput.value = _norm(serialValue);

    const cmtInput = document.createElement("input");
    cmtInput.type = "text"; cmtInput.className = "cmt"; cmtInput.placeholder = "Comment"; cmtInput.maxLength = 500;
    cmtInput.value = commentValue || "All Ok";

    const tagEl = document.createElement("span");
    tagEl.className = "serial-status-tag";

    snInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); cmtInput.focus(); } });
    cmtInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSerialPair(row, "", "All Ok", true); } });
    snInput.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (text && SERIAL_SEP_RE.test(text)) { e.preventDefault(); snInput.value = ""; openBulkForRow(row, text); }
    });
    snInput.addEventListener("change", () => { updateQty(row); revalidateRowSerials(row); });
    snInput.addEventListener("input", () => updateQty(row));

    pair.appendChild(snInput); pair.appendChild(cmtInput); pair.appendChild(tagEl);
    serialsDiv.appendChild(pair);
    updateQty(row);
    if (autoFocus) snInput.focus();
  }

  function removeSerial(row) {
    const pairs = row.querySelectorAll(".serial-pair");
    if (pairs.length > 0) {
      pairs[pairs.length - 1].remove();
      updateQty(row); revalidateRowSerials(row);
      const remaining = row.querySelectorAll(".sn");
      if (remaining.length) remaining[remaining.length - 1].focus();
    }
  }

  function openBulkForRow(row, prefill = "") {
    const itemName = _norm(row.querySelector(".item_name") && row.querySelector(".item_name").value);
    if (!itemName) {
      Swal.fire({ icon: "warning", title: "Select Item First", text: "Please choose an item before pasting bulk serials." });
      return;
    }
    Swal.fire({
      title: "📋 Bulk Paste — " + esc(itemName),
      html: `<div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
               Paste serial numbers (newline, tab, comma, or semicolon separated).<br>
               Each serial gets a default comment <b>"All Ok"</b>. Duplicates &amp; stock conflicts are highlighted automatically.
             </div>
             <textarea id="bulkTA" style="width:100%;min-height:190px;padding:12px;font-family:'DM Mono',monospace;font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;background:#f9fafb;color:#111827;" placeholder="SN001&#10;SN002&#10;SN003">${esc(prefill)}</textarea>`,
      showCancelButton: true, confirmButtonText: "Add Serials", cancelButtonText: "Cancel", confirmButtonColor: "#2563eb",
      focusConfirm: false, width: "540px",
      preConfirm: () => {
        const ta = document.getElementById("bulkTA");
        if (!ta || !ta.value.trim()) { Swal.showValidationMessage("⚠️ Paste at least one serial number."); return false; }
        return ta.value;
      },
      didOpen: () => { const ta = document.getElementById("bulkTA"); if (ta) ta.focus(); },
    }).then((res) => {
      if (!res.isConfirmed || !res.value) return;
      const tokens = res.value.split(SERIAL_SEP_RE).map((s) => s.trim()).filter(Boolean);
      if (!tokens.length) return;
      const seen = new Set(); const unique = []; let intraDups = 0;
      tokens.forEach((t) => { const k = t.toUpperCase(); if (seen.has(k)) intraDups++; else { seen.add(k); unique.push(t); } });
      const formSNs = collectAllSNs(); const accepted = []; let crossDups = 0;
      unique.forEach((t) => { if (formSNs.has(t.toUpperCase())) crossDups++; else accepted.push(t); });
      accepted.forEach((sn) => addSerialPair(row, sn, "All Ok", false));
      setTimeout(() => revalidateRowSerials(row), 100);
      calculateTotal();
      const totalDups = intraDups + crossDups;
      Swal.fire({
        icon: accepted.length ? "success" : "warning", title: "Bulk Serial Result",
        html: `<div style="text-align:left;line-height:1.8;font-size:14px;">
                 <div>📥 Total pasted: <b>${tokens.length}</b></div>
                 <div>✅ Added: <b style="color:#16a34a;">${accepted.length}</b></div>
                 <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${totalDups}</b></div>
               </div>`,
      });
    });
  }

  // ---- item rows --------------------------------------------------------
  function addItemRow(shouldFocus = true) {
    const itemsDiv = document.getElementById("items");
    const row = document.createElement("div");
    row.className = "item-row purchase-row";
    row.innerHTML = `
      <div class="item_name_field autocomplete-container">
        <input type="text" class="item_name item_search_name sale-input" placeholder="Search item name…" autocomplete="off" style="font-size:0.87rem;">
        <div class="items_suggestions"></div>
      </div>
      <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00">
      <input type="number" class="qty-box" readonly value="0">
      <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
      <div class="row-actions">
        <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
        <button type="button" class="custom-btn remove-serial">− Serial</button>
        <button type="button" class="custom-btn btn-bulk bulk-row-btn" title="Paste bulk serials"><i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk</button>
        <button type="button" class="custom-btn remove-item">✕ Remove</button>
      </div>`;

    row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
    row.querySelector(".remove-serial").onclick = () => removeSerial(row);
    row.querySelector(".bulk-row-btn").onclick = () => openBulkForRow(row);
    row.querySelector(".remove-item").onclick = () => {
      row.remove();
      if (!itemsDiv.querySelector(".item-row")) addItemRow(false);
      calculateTotal();
    };
    row.querySelector(".unit_price").oninput = () => calculateTotal();

    itemsDiv.appendChild(row);

    const nameInput = row.querySelector(".item_name");
    const sugg = row.querySelector(".items_suggestions");
    setupAutocomplete(nameInput, sugg, ITEM_URL, null);

    addSerialPair(row, "", "All Ok", false);
    if (shouldFocus) nameInput.focus();
  }

  // ---- save -------------------------------------------------------------
  function collectItems() {
    const items = []; let bad = null;
    document.querySelectorAll("#items .item-row").forEach((row) => {
      const name = _norm(row.querySelector(".item_name").value);
      const price = row.querySelector(".unit_price").value;
      const serials = [];
      row.querySelectorAll(".serial-pair").forEach((pair) => {
        const sn = _norm(pair.querySelector(".sn").value);
        if (!sn) return;
        const cmt = _norm(pair.querySelector(".cmt").value) || "All Ok";
        serials.push({ serial: sn, comment: cmt });
      });
      if (!name && !price && !serials.length) return;
      if (!name) bad = bad || "Please choose an item for every row.";
      else if (price === "" || Number(price) < 0) bad = bad || "Enter a valid unit cost for " + name + ".";
      else if (!serials.length) bad = bad || "Enter at least one serial number for " + name + ".";
      items.push({ item_name: name, unit_price: Number(price), serials });
    });
    // duplicate check across the whole form
    const all = {};
    for (const it of items) {
      for (const s of it.serials) {
        const k = s.serial.toUpperCase();
        if (all[k]) { bad = bad || "Duplicate serial in this entry: " + s.serial; }
        all[k] = true;
      }
    }
    return { items, bad };
  }

  function save() {
    const { items, bad } = collectItems();
    if (bad) { Swal.fire({ icon: "warning", title: "Check your entries", text: bad }); return; }
    if (!items.length) { Swal.fire({ icon: "warning", title: "Nothing to save", text: "Add at least one item with serials." }); return; }
    const payload = {
      as_of_date: document.getElementById("as_of_date").value || null,
      vendor_name: _norm(document.getElementById("search_name").value) || null,
      items,
    };
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    postJSON(U.create, payload).then(({ ok, data }) => {
      btn.disabled = false;
      if (ok && data.status === "success") {
        Swal.fire({ icon: "success", title: "Opening stock saved", text: `${data.units} unit(s) across ${data.items} item(s) — total ${fmt(data.total_cost)}.` });
        resetForm(); loadList(); loadOBE();
      } else {
        Swal.fire({ icon: "error", title: "Could not save", text: (data && data.message) || "Something went wrong." });
      }
    });
  }

  function resetForm() {
    document.getElementById("search_name").value = "";
    document.getElementById("items").innerHTML = "";
    addItemRow(false);
    calculateTotal();
  }

  // ---- list / details / delete -----------------------------------------
  function loadList() {
    const body = document.getElementById("loads-body");
    fetch(U.list).then((r) => r.json()).then((rows) => {
      if (!Array.isArray(rows) || !rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="os-empty">No opening stock loaded yet.</td></tr>`;
        return;
      }
      body.innerHTML = rows.map((r) => {
        const sold = (r.unit_count || 0) - (r.in_stock_count || 0);
        const delBtn = PERMS.canDelete
          ? `<button class="os-icon-btn os-del" data-id="${r.opening_stock_id}" title="Delete"><i class="fa-solid fa-trash"></i></button>` : "";
        return `<tr>
          <td>${esc(r.as_of_date || "")}</td>
          <td>${r.vendor ? esc(r.vendor) : '<span class="os-muted">—</span>'}</td>
          <td class="num">${r.item_count || 0}</td>
          <td class="num">${r.unit_count || 0}</td>
          <td class="num">${r.in_stock_count || 0}${sold > 0 ? ` <span class="os-sold-tag">${sold} sold</span>` : ""}</td>
          <td class="num">${fmt(r.total_cost)}</td>
          <td class="os-actions">
            <button class="os-icon-btn os-view" data-id="${r.opening_stock_id}" title="View"><i class="fa-solid fa-eye"></i></button>
            ${delBtn}
          </td></tr>`;
      }).join("");
      body.querySelectorAll(".os-view").forEach((b) => b.addEventListener("click", () => viewDetails(b.dataset.id)));
      body.querySelectorAll(".os-del").forEach((b) => b.addEventListener("click", () => deleteLoad(b.dataset.id)));
    }).catch(() => { body.innerHTML = `<tr><td colspan="7" class="os-empty">Could not load.</td></tr>`; });
  }

  const modal = document.getElementById("details-modal");
  function viewDetails(id) {
    fetch(U.details + "?id=" + encodeURIComponent(id)).then((r) => r.json()).then((d) => {
      if (!d || d.error) { Swal.fire({ icon: "error", title: "Not found", text: (d && d.error) || "" }); return; }
      document.getElementById("details-title").textContent = "Opening Stock #" + d.opening_stock_id + (d.vendor ? " · " + d.vendor : "");
      const items = (d.items || []).map((it) => {
        const serials = (it.serials || []).map((s) =>
          `<div class="os-serial-line ${s.in_stock ? "" : "sold"}">
             <span class="os-serial-chip ${s.in_stock ? "" : "sold"}">${esc(s.serial)}${s.in_stock ? "" : " · sold"}</span>
             <span class="os-serial-note">${esc(s.comment || "")}</span>
           </div>`).join("");
        return `<div class="os-detail-item">
            <div class="os-detail-item-head"><strong>${esc(it.item_name)}</strong><span>${it.qty} × ${fmt(it.unit_price)}</span></div>
            <div class="os-serial-lines">${serials}</div>
          </div>`;
      }).join("");
      document.getElementById("details-body").innerHTML =
        `<div class="os-detail-meta">As-of ${esc(d.as_of_date || "")} · Total ${fmt(d.total_cost)} · by ${esc(d.created_by || "—")}</div>${items}`;
      modal.style.display = "flex";
    });
  }
  if (modal) {
    document.getElementById("details-close").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
  }

  function deleteLoad(id) {
    Swal.fire({
      icon: "warning", title: "Delete this opening stock?",
      text: "This removes the units and reverses the opening entry. Blocked if any unit was already sold.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626",
    }).then((res) => {
      if (!res.isConfirmed) return;
      postJSON(U.del, { id: Number(id) }).then(({ ok, data }) => {
        if (ok && data.status === "success") {
          Swal.fire({ icon: "success", title: "Deleted", timer: 1200, showConfirmButton: false });
          loadList(); loadOBE();
        } else {
          Swal.fire({ icon: "error", title: "Cannot delete", text: (data && data.message) || "" });
        }
      });
    });
  }

  // ---- Opening Balance Equity ------------------------------------------
  function loadOBE() {
    const banner = document.getElementById("obe-banner");
    fetch(U.obeStatus).then((r) => r.json()).then((d) => {
      if (!d || d.error) { banner.style.display = "none"; return; }
      const amt = Number(d.obe_equity_amount || 0);
      banner.style.display = "flex";
      document.getElementById("obe-amount").textContent = fmt(amt);
      const hint = document.getElementById("obe-hint");
      const reclassBtn = document.getElementById("reclass-btn");
      if (d.needs_reclass) {
        hint.textContent = "Pending — sweep into Owner's Capital once all opening balances are entered.";
        if (reclassBtn) reclassBtn.style.display = "inline-flex";
      } else {
        hint.textContent = "Cleared to Owner's Capital.";
        if (reclassBtn) reclassBtn.style.display = "none";
      }
    }).catch(() => { banner.style.display = "none"; });
  }

  const reclassBtn = document.getElementById("reclass-btn");
  if (reclassBtn) {
    reclassBtn.addEventListener("click", () => {
      Swal.fire({
        icon: "question", title: "Reclassify to Owner's Capital?",
        text: "Move the entire Opening Balance Equity into Owner's Capital in one journal entry. Do this only after all opening balances (stock, parties, cash) are entered.",
        showCancelButton: true, confirmButtonText: "Reclassify",
      }).then((res) => {
        if (!res.isConfirmed) return;
        postJSON(U.reclassify, {}).then(({ ok, data }) => {
          if (ok && (data.status === "success" || data.status === "noop")) {
            Swal.fire({ icon: "success", title: data.status === "noop" ? "Already cleared" : "Reclassified",
              text: data.status === "noop" ? "" : `Moved ${fmt(data.amount)} into Owner's Capital.` });
            loadOBE();
          } else {
            Swal.fire({ icon: "error", title: "Could not reclassify", text: (data && data.message) || "" });
          }
        });
      });
    });
  }

  // ---- init -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    const vendor = document.getElementById("search_name");
    const vbox = document.getElementById("vendor_suggestions");
    if (vendor && vbox) setupAutocomplete(vendor, vbox, vendor.dataset.autocompleteUrl, null);
    const dateEl = document.getElementById("as_of_date");
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
    if (document.getElementById("items")) addItemRow(false);
    const addBtn = document.getElementById("add-item-btn");
    if (addBtn) addBtn.addEventListener("click", () => addItemRow(true));
    const saveBtn = document.getElementById("save-btn");
    if (saveBtn) saveBtn.addEventListener("click", save);
    const refresh = document.getElementById("refresh-btn");
    if (refresh) refresh.addEventListener("click", loadList);
    calculateTotal();
    loadList();
    loadOBE();
  });
})();
