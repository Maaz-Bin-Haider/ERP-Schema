/* ============================================================
   Opening Stock — onboarding / data migration page
   Loads existing stock (serial + cost) with no vendor payable,
   shows the Opening Balance Equity status, and reclassifies it
   into Owner's Capital in one click.
   ============================================================ */
(function () {
  "use strict";

  const U = window.OS_URLS || {};
  const PERMS = window.OS_PERMS || {};

  // ---- helpers ----------------------------------------------------------
  function getCookie(name) {
    const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return m ? decodeURIComponent(m.pop()) : "";
  }
  function csrf() {
    const inp = document.querySelector("input[name=csrfmiddlewaretoken]");
    return (inp && inp.value) || getCookie("csrftoken");
  }
  function fmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: JSON.stringify(body || {}),
    }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function parseSerials(text) {
    return String(text || "")
      .split(/[\r\n\t,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ---- autocomplete (shared by vendor + item fields) --------------------
  function setupAutocomplete(input) {
    const box = input.parentElement.querySelector(".os-suggestions");
    if (!box) return;
    const url = input.dataset.autocompleteUrl;
    let timer = null;

    input.addEventListener("input", function () {
      const q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 1) { box.style.display = "none"; box.innerHTML = ""; return; }
      timer = setTimeout(() => {
        fetch(url + "?term=" + encodeURIComponent(q))
          .then((r) => r.json())
          .then((list) => {
            if (!Array.isArray(list) || !list.length) { box.style.display = "none"; return; }
            box.innerHTML = list.map((name) => `<div class="os-suggestion">${esc(name)}</div>`).join("");
            box.style.display = "block";
          })
          .catch(() => { box.style.display = "none"; });
      }, 160);
    });

    box.addEventListener("mousedown", function (e) {
      const it = e.target.closest(".os-suggestion");
      if (!it) return;
      e.preventDefault();
      input.value = it.textContent;
      box.style.display = "none";
    });
    input.addEventListener("blur", () => setTimeout(() => { box.style.display = "none"; }, 150));
  }

  // ---- item rows --------------------------------------------------------
  const itemsContainer = document.getElementById("items-container");
  const tpl = document.getElementById("item-row-tpl");

  function recompute() {
    let grand = 0;
    itemsContainer.querySelectorAll(".os-item-row").forEach((row) => {
      const cost = parseFloat(row.querySelector(".os-cost").value) || 0;
      const serials = parseSerials(row.querySelector(".os-serials").value);
      const line = cost * serials.length;
      grand += line;
      row.querySelector(".os-serial-count").textContent = serials.length + (serials.length === 1 ? " unit" : " units");
      row.querySelector(".os-rowtotal").textContent = fmt(line);
    });
    const gt = document.getElementById("grand-total");
    if (gt) gt.textContent = fmt(grand);
  }

  function addItemRow() {
    if (!tpl) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
    itemsContainer.appendChild(node);
    setupAutocomplete(node.querySelector(".os-item-name"));
    node.querySelector(".os-cost").addEventListener("input", recompute);
    node.querySelector(".os-serials").addEventListener("input", recompute);
    node.querySelector(".os-remove-row").addEventListener("click", () => {
      node.remove();
      if (!itemsContainer.querySelector(".os-item-row")) addItemRow();
      recompute();
    });
    recompute();
  }

  // ---- save -------------------------------------------------------------
  function collectItems() {
    const items = [];
    let bad = null;
    itemsContainer.querySelectorAll(".os-item-row").forEach((row) => {
      const name = row.querySelector(".os-item-name").value.trim();
      const cost = row.querySelector(".os-cost").value;
      const serials = parseSerials(row.querySelector(".os-serials").value);
      if (!name && !cost && !serials.length) return; // skip empty row
      if (!name) bad = bad || "Please choose an item for every row.";
      else if (cost === "" || Number(cost) < 0) bad = bad || "Enter a valid unit cost for " + name + ".";
      else if (!serials.length) bad = bad || "Enter at least one serial number for " + name + ".";
      items.push({ item_name: name, unit_price: Number(cost), serials: serials });
    });
    return { items, bad };
  }

  function save() {
    const { items, bad } = collectItems();
    if (bad) { Swal.fire({ icon: "warning", title: "Check your entries", text: bad }); return; }
    if (!items.length) { Swal.fire({ icon: "warning", title: "Nothing to save", text: "Add at least one item with serials." }); return; }

    const payload = {
      as_of_date: document.getElementById("as_of_date").value || null,
      vendor_name: document.getElementById("vendor_name").value.trim() || null,
      items: items,
    };
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    postJSON(U.create, payload).then(({ ok, data }) => {
      btn.disabled = false;
      if (ok && data.status === "success") {
        Swal.fire({ icon: "success", title: "Opening stock saved",
          text: `${data.units} unit(s) across ${data.items} item(s) — total ${fmt(data.total_cost)}.` });
        resetForm();
        loadList();
        loadOBE();
      } else {
        Swal.fire({ icon: "error", title: "Could not save", text: (data && data.message) || "Something went wrong." });
      }
    });
  }

  function resetForm() {
    document.getElementById("vendor_name").value = "";
    itemsContainer.innerHTML = "";
    addItemRow();
    recompute();
  }

  // ---- list -------------------------------------------------------------
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
    }).catch(() => {
      body.innerHTML = `<tr><td colspan="7" class="os-empty">Could not load.</td></tr>`;
    });
  }

  // ---- details modal ----------------------------------------------------
  const modal = document.getElementById("details-modal");
  function viewDetails(id) {
    fetch(U.details + "?id=" + encodeURIComponent(id)).then((r) => r.json()).then((d) => {
      if (!d || d.error) { Swal.fire({ icon: "error", title: "Not found", text: (d && d.error) || "" }); return; }
      document.getElementById("details-title").textContent =
        "Opening Stock #" + d.opening_stock_id + (d.vendor ? " · " + d.vendor : "");
      const items = (d.items || []).map((it) => {
        const serials = (it.serials || []).map((s) =>
          `<span class="os-serial-chip ${s.in_stock ? "" : "sold"}">${esc(s.serial)}${s.in_stock ? "" : " · sold"}</span>`).join("");
        return `<div class="os-detail-item">
            <div class="os-detail-item-head">
              <strong>${esc(it.item_name)}</strong>
              <span>${it.qty} × ${fmt(it.unit_price)}</span>
            </div>
            <div class="os-serial-chips">${serials}</div>
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

  // ---- delete -----------------------------------------------------------
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

  // ---- Opening Balance Equity status + reclassify -----------------------
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
    const vendor = document.getElementById("vendor_name");
    if (vendor) setupAutocomplete(vendor);
    const dateEl = document.getElementById("as_of_date");
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
    if (itemsContainer) addItemRow();
    const addBtn = document.getElementById("add-item-btn");
    if (addBtn) addBtn.addEventListener("click", addItemRow);
    const saveBtn = document.getElementById("save-btn");
    if (saveBtn) saveBtn.addEventListener("click", save);
    const refresh = document.getElementById("refresh-btn");
    if (refresh) refresh.addEventListener("click", loadList);
    loadList();
    loadOBE();
  });
})();
