/* ============================================================
   CONTRA ENTRY PAGE — JavaScript
   Two party fields (From / To), each with autocomplete + live
   balance. Navigation, history & date-wise modals, delete
   confirm, keyboard shortcuts. Mirrors the Payments page.
   ============================================================ */

/* ===== HELPERS ===== */
function setFormMode(mode) {
  const statusMode = document.getElementById("statusMode");
  const statusText = document.getElementById("statusText");
  const submitBtn  = document.getElementById("submitBtn");
  const deleteBtn  = document.getElementById("deleteBtn");
  const badgeEl    = document.getElementById("entryByBadge");
  if (!statusMode) return;

  if (mode === "edit") {
    statusMode.className = "status-mode mode-edit";
    if (statusText) statusText.textContent = "Editing Record";
    if (submitBtn)  submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update Contra';
    if (deleteBtn)  deleteBtn.style.display = "inline-flex";
    if (badgeEl)    badgeEl.style.display = "inline-flex";
  } else {
    statusMode.className = "status-mode mode-new";
    if (statusText) statusText.textContent = "New Entry";
    if (submitBtn)  submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Contra';
    if (deleteBtn)  deleteBtn.style.display = "inline-flex";
    if (badgeEl)    badgeEl.style.display = "none";
  }
}

function updateRecordChip(id) {
  const chip = document.getElementById("recordIdChip");
  if (chip) chip.textContent = id ? "#" + id : "New";
}

function populateForm(data) {
  document.getElementById("contra_date").value      = data.contra_date     || "";
  document.getElementById("from_search_name").value = data.from_party_name || "";
  document.getElementById("to_search_name").value   = data.to_party_name   || "";
  document.getElementById("amount").value           = data.amount          || "";
  document.getElementById("description").value      = data.description     || "";

  fetchPartyBalance(data.from_party_name || "", "fromBalanceDisplay");
  fetchPartyBalance(data.to_party_name   || "", "toBalanceDisplay");

  const entryByName = document.getElementById("entryByName");
  if (entryByName) entryByName.textContent = data.created_by || "—";

  const hiddenId = document.getElementById("current_contra_id");
  if (hiddenId) hiddenId.value = data.contra_id || "";

  updateRecordChip(data.contra_id);
  setFormMode(data.contra_id ? "edit" : "new");
}


/* ===== PARTY BALANCE FETCH (per field) ===== */
function fetchPartyBalance(partyName, balanceElId) {
  const el = $("#" + balanceElId);
  if (!partyName) { el.hide(); return; }
  $.ajax({
    url: "/contra/party-balance/",
    data: { name: partyName },
    dataType: "json",
    success: function (data) {
      if (!data.found) { el.hide(); return; }
      const balance = parseFloat(data.balance) || 0;
      const absVal  = Math.abs(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      let label, cssClass;
      if (balance > 0)      { label = "Balance Receivable: " + absVal; cssClass = "party-balance-receivable"; }
      else if (balance < 0) { label = "Balance Payable: " + absVal;    cssClass = "party-balance-payable"; }
      else                  { label = "Balance: 0.00 (Settled)";        cssClass = "party-balance-settled"; }
      el.removeClass("party-balance-receivable party-balance-payable party-balance-settled")
        .addClass(cssClass).text(label).show();
    },
    error: function () { el.hide(); }
  });
}


/* ===== REUSABLE AUTOCOMPLETE WIRING ===== */
function setupPartyField(inputId, suggestionsId, balanceId) {
  const $input = $("#" + inputId);
  const $box   = $("#" + suggestionsId);
  const url    = $input.data("autocomplete-url");
  let selectedIndex = -1;

  $input.on("input", function () {
    const query = $(this).val();
    selectedIndex = -1;
    if (query.length < 1) { $box.hide(); fetchPartyBalance("", balanceId); return; }
    $.ajax({
      url: url, data: { term: query }, dataType: "json",
      success: function (data) {
        $box.empty();
        if (data.length > 0) {
          data.forEach(function (party) {
            $("<div>").addClass("suggestion-item").text(party).appendTo($box)
              .on("click", function () {
                $input.val(party);
                $box.hide();
                fetchPartyBalance(party, balanceId);
              });
          });
          $box.show();
        } else {
          $box.hide();
        }
      },
      error: function (xhr, status, error) { console.error("Autocomplete error:", status, error); }
    });
  });

  $input.on("keydown", function (e) {
    const items = $box.find(".suggestion-item");
    if (items.length === 0) return;
    if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      items.removeClass("highlight");
      items.eq(selectedIndex).addClass("highlight")[0].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      items.removeClass("highlight");
      items.eq(selectedIndex).addClass("highlight")[0].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      items.eq(selectedIndex).trigger("click");
    }
  });

  // refresh balance when leaving the field (typed exact name)
  $input.on("change blur", function () {
    setTimeout(() => fetchPartyBalance($(this).val(), balanceId), 150);
  });

  $(document).on("click", function (e) {
    if (!$(e.target).closest("#" + inputId + ", #" + suggestionsId).length) $box.hide();
  });
}


/* ===== DOCUMENT READY ===== */
$(document).ready(function () {
  const dateInput = document.getElementById("contra_date");
  if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

  const existingId = document.getElementById("current_contra_id")?.value;
  setFormMode(existingId ? "edit" : "new");

  setupPartyField("from_search_name", "from_suggestions", "fromBalanceDisplay");
  setupPartyField("to_search_name",   "to_suggestions",   "toBalanceDisplay");

  // populate balances if values already present (edit re-render)
  const fromVal = document.getElementById("from_search_name").value;
  const toVal   = document.getElementById("to_search_name").value;
  if (fromVal) fetchPartyBalance(fromVal, "fromBalanceDisplay");
  if (toVal)   fetchPartyBalance(toVal, "toBalanceDisplay");
});


/* ===== NAVIGATE (Previous / Next) ===== */
function navigateContra(action) {
  const currentId = document.getElementById("current_contra_id").value || "";
  fetch(`/contra/contra/get/?action=${action}&current_id=${encodeURIComponent(currentId)}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        Swal.fire({
          title: "End of Records",
          text: action === "previous" ? "You are at the first contra entry." : "You are at the latest contra entry.",
          icon: "info", toast: true, position: "top-end", timer: 2000, showConfirmButton: false
        });
        return;
      }
      populateForm(data);
    })
    .catch(err => console.error("Navigation error:", err));
}


/* ===== DELETE CONFIRM ===== */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contraForm");
  let confirmedDelete = false;
  form.addEventListener("submit", function (e) {
    const btn = e.submitter;
    if (btn && btn.value === "delete" && !confirmedDelete) {
      e.preventDefault();
      Swal.fire({
        title: "Delete this contra entry?",
        text: "This will reverse the transfer. This action cannot be undone.",
        icon: "warning", showCancelButton: true,
        confirmButtonColor: "#dc2626", cancelButtonColor: "#6b7280",
        confirmButtonText: "Yes, delete", cancelButtonText: "Cancel"
      }).then(result => {
        if (result.isConfirmed) { confirmedDelete = true; form.requestSubmit(btn); }
      });
    }
  });
});


/* ===== FETCH CONTRAS (History / Date-Wise) ===== */
function fetchContras(url) {
  $.ajax({
    url: url, type: "GET", dataType: "json",
    beforeSend: function () {
      Swal.fire({ title: "Loading…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    },
    success: function (response) {
      if (!response || response.length === 0) {
        Swal.fire({ title: "No Contra Entries Found", text: "No entries match this query.", icon: "info", confirmButtonColor: "#2563eb" });
        return;
      }

      let html = `
        <div style="margin-bottom:10px;">
          <input type="text" id="contraSearch" placeholder="🔍 Search by party or ref #"
                 style="width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
                        font-size:0.875rem;outline:none;font-family:inherit;">
        </div>
        <div id="contrasList" style="max-height:360px;overflow-y:auto;text-align:left;">
      `;
      let currentDate = null;
      response.forEach((c, index) => {
        if (c.contra_date !== currentDate) {
          if (currentDate !== null) html += `</div>`;
          currentDate = c.contra_date;
          html += `<div class="payment-date-group"><div class="payment-date-header">${currentDate}</div>`;
        }
        const search = ((c.from_party_name || "") + " " + (c.to_party_name || "")).toLowerCase();
        html += `
          <div class="payment-row" data-search="${search}"
               data-ref="${(c.reference_no || "").toLowerCase()}" data-id="${c.contra_id}">
            <div class="payment-top">
              <span class="payment-ref">${c.reference_no || ""}</span>
              <span class="payment-party">${c.from_party_name || ""} &rarr; ${c.to_party_name || ""}</span>
              <span class="payment-amount">${Number(c.amount).toLocaleString()}</span>
            </div>
            <div class="payment-tooltip">${c.description || "No description"}</div>
          </div>`;
        if (index === response.length - 1) html += `</div>`;
      });
      html += `</div>`;

      Swal.fire({
        title: "🔁 Contra History", html: html, width: "660px",
        showConfirmButton: true, confirmButtonText: "Close", confirmButtonColor: "#6b7280",
        didOpen: () => {
          document.getElementById("contraSearch").addEventListener("input", function () {
            const q = this.value.toLowerCase();
            document.querySelectorAll(".payment-row").forEach(row => {
              const visible = row.dataset.search.includes(q) || row.dataset.ref.includes(q);
              row.style.display = visible ? "flex" : "none";
            });
            document.querySelectorAll(".payment-date-group").forEach(group => {
              const hasVisible = [...group.querySelectorAll(".payment-row")].some(r => r.style.display !== "none");
              group.style.display = hasVisible ? "block" : "none";
            });
          });
          document.querySelectorAll(".payment-row").forEach(row => {
            row.addEventListener("click", function () {
              const id = this.dataset.id;
              fetch(`/contra/contra/get/?current_id=${id}`)
                .then(res => res.json())
                .then(data => { if (data.error) return; Swal.close(); populateForm(data); })
                .catch(err => console.error(err));
            });
          });
        }
      });
    },
    error: function () {
      Swal.fire({ title: "Error", text: "Could not load contra entries. Please try again.", icon: "error", confirmButtonColor: "#dc2626" });
    }
  });
}

$("#btnOldContras").on("click", function () { fetchContras("/contra/get-old-contras/"); });

$("#btnContrasDateWise").on("click", function () {
  const today = new Date().toISOString().split("T")[0];
  Swal.fire({
    title: "Filter by Date Range",
    html: `
      <div style="text-align:left;padding:0 8px;">
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:0.82rem;font-weight:500;color:#64748b;margin-bottom:5px;">From Date</label>
          <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:0;" max="${today}">
        </div>
        <div>
          <label style="display:block;font-size:0.82rem;font-weight:500;color:#64748b;margin-bottom:5px;">To Date</label>
          <input type="date" id="toDate" class="swal2-input" style="width:100%;margin:0;" value="${today}" max="${today}">
        </div>
      </div>`,
    focusConfirm: false, showCancelButton: true,
    confirmButtonText: "Fetch Entries", confirmButtonColor: "#2563eb", cancelButtonColor: "#6b7280",
    preConfirm: () => {
      const from = document.getElementById("fromDate").value;
      const to   = document.getElementById("toDate").value;
      if (!from || !to) { Swal.showValidationMessage("⚠ Both dates are required"); return false; }
      if (from > to)    { Swal.showValidationMessage("⚠ From date cannot be after To date"); return false; }
      return { from, to };
    }
  }).then(result => {
    if (result.isConfirmed) {
      const { from, to } = result.value;
      fetchContras(`/contra/get-contras-date-wise/?from=${from}&to=${to}`);
    }
  });
});


/* ===== KEYBOARD FIELD NAVIGATION ===== */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contraForm");
  if (!form) return;
  const focusable = form.querySelectorAll("input:not([type=hidden]):not([readonly]), textarea, select, button");

  form.addEventListener("keydown", function (e) {
    const key = e.key;
    const active = document.activeElement;
    if (($("#from_suggestions:visible").length > 0 || $("#to_suggestions:visible").length > 0) &&
        ["ArrowDown", "ArrowUp", "Enter"].includes(key)) return;

    const index = Array.from(focusable).indexOf(active);
    if (index === -1) return;
    if (key === "Enter" || key === "ArrowDown") {
      if (active.tagName === "TEXTAREA" && key === "Enter") return;
      e.preventDefault();
      const next = focusable[index + 1];
      if (next) next.focus();
    } else if (key === "ArrowUp") {
      e.preventDefault();
      const prev = focusable[index - 1];
      if (prev) prev.focus();
    }
  });
});
