
// // Function to get CSRF token
// function getCSRFToken() {
//   const name = "csrftoken";
//   const cookies = document.cookie.split(";").map(c => c.trim());
//   for (let c of cookies) {
//     if (c.startsWith(name + "=")) return decodeURIComponent(c.split("=")[1]);
//   }
//   return null;
// }

// // 🧩 Add Serial Input
// function addSerial(autoFocus = true) {
//   const serialsDiv = document.getElementById("serials");

//   // Create row container
//   const row = document.createElement("div");
//   row.className = "serial-row";

//   // Create item name input (readonly)
//   const itemInput = document.createElement("input");
//   itemInput.type = "text";
//   itemInput.placeholder = "Item Name";
//   itemInput.className = "item-input";
//   itemInput.readOnly = true;

//   // Create item price input (readonly)
//   const itemPrice = document.createElement("input");
//   itemPrice.type = "text";
//   itemPrice.placeholder = "Item Price";
//   itemPrice.className = "item-input";
//   itemPrice.readOnly = true;


//   // Create serial input
//   const serialInput = document.createElement("input");
//   serialInput.type = "text";
//   serialInput.placeholder = "Enter Serial Number";
//   serialInput.className = "serial-input";
//   serialInput.oninput = updateCount;
//   serialInput.onkeydown = handleEnterKey;

//   // ❌ Create remove button
//   const removeBtn = document.createElement("button");
//   removeBtn.innerHTML = "×";
//   removeBtn.className = "remove-btn";
//   removeBtn.title = "Remove this serial";
//   removeBtn.onclick = function () {
//     row.remove();
//     updateCount();
//   };


//   // Add event to handle serial lookup
//   serialInput.addEventListener("change", function () {
//     const serialValue = serialInput.value.trim();
//     if (serialValue) {
//       fetch(`/purchaseReturn/lookup/${encodeURIComponent(serialValue)}/`)
//         .then(res => res.json())
//         .then(data => {
//           if (data.success) {
//             itemInput.value = data.item_name;
//             itemPrice.value = data.item_price;
//           } else {
//             itemInput.value = "";
//             Swal.fire({
//               icon: "error",
//               title: "Not Found",
//               text: data.message || "Serial not found."
//             });
//           }
//         })
//         .catch(() => {
//           itemInput.value = "";
//           Swal.fire({
//             icon: "error",
//             title: "Error",
//             text: "Failed to fetch item for this serial."
//           });
//         });
//     } else {
//       itemInput.value = "";
//     }
//   });

//   // Append both inputs to row
  
//   row.appendChild(serialInput);
//   row.appendChild(itemInput);
//   row.appendChild(itemPrice);
//   row.appendChild(removeBtn);

//   // Append row to main serials container
//   serialsDiv.appendChild(row);

//   if (autoFocus) serialInput.focus();
//   updateCount();
// }

// // 🧮 Count serials
// function updateCount() {
//   const serials = Array.from(document.querySelectorAll("#serials input"))
//     .map(i => i.value.trim())
//     .filter(v => v !== "");
//   document.getElementById("totalQty").textContent = serials.length;
// }



// // To handle when user press Enter Key after typing Serial Number
// function handleEnterKey(e) {
//   if (e.key === "Enter") {
//     e.preventDefault();
    
//     const serialValue = e.target.value.trim();
//     if (serialValue) {
//       // Trigger 'change' manually to lookup item name
//       e.target.dispatchEvent(new Event("change"));
//     }

//     // Move focus to next serial input
//     const inputs = Array.from(document.querySelectorAll(".serial-input"));
//     const index = inputs.indexOf(e.target);
//     if (index !== -1 && index + 1 < inputs.length) {
//       inputs[index + 1].focus();
//     }
//   }
// }

// // 🧾 Build Payload & Submit
// function submitReturn(event) {
//   event.preventDefault();
//   const form = event.target;
//   const action = form.querySelector('button[type="submit"][clicked="true"]')?.value; 


//   const partyName = document.getElementById("search_name").value.trim();
//   if (!partyName) {
//     Swal.fire({ icon: "warning", title: "Missing Party", text: "Enter a party name first." });
//     return;
//   }

//   let returnDate = document.getElementById("return_date").value;
//   if (!returnDate) returnDate = new Date().toISOString().slice(0, 10);

//   const serials = Array.from(document.querySelectorAll(".serial-input"))
//     .map(i => i.value.trim())
//     .filter(v => v);

//   if (serials.length === 0) {
//     Swal.fire({ icon: "warning", title: "No Serials", text: "Enter at least one serial number." });
//     return;
//   }

//   const payload = {
//     return_id: document.getElementById("current_return_id").value || "",
//     party_name: partyName,
//     return_date: returnDate,
//     serials: serials,
//     action: action,
//   };
  
//   fetch("/purchaseReturn/create-purchase-return/", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-CSRFToken": getCSRFToken()
//     },
//     body: JSON.stringify(payload)
//   })
//   .then(async res => {
//     const data = await res.json();
//     if (data.success) {
//       Swal.fire({
//         icon: "success",
//         title: "Sucess ✅",
//         text: data.message || "Return saved successfully!",
//         timer: 1500,
//         showConfirmButton: false
//       }).then(() => window.location.reload());
//     } else {
//       Swal.fire({ icon: "error", title: "Error", text: data.message || "Failed to save return." });
//     }
//   })
//   .catch(err => Swal.fire({ icon: "error", title: "Network Error", text: err.message }));
// }

// // 🪄 Autocomplete for Party Names
// $(document).ready(function () {
//   let autocompleteUrl = $("#search_name").data("autocomplete-url");
//   let selectedIndex = -1;

//   $("#search_name").on("input", function () {
//     let query = $(this).val();
//     let suggestionsBox = $("#suggestions");
//     selectedIndex = -1;

//     if (query.length >= 1) {
//       $.ajax({
//         url: autocompleteUrl,
//         data: { term: query },
//         dataType: "json",
//         success: function (data) {
//           suggestionsBox.empty();
//           if (data.length > 0) {
//             data.forEach(function (party) {
//               $("<div>")
//                 .addClass("suggestion-item")
//                 .text(party)
//                 .css({ padding: "5px", cursor: "pointer", borderBottom: "1px solid #ddd" })
//                 .appendTo(suggestionsBox)
//                 .on("click", function () {
//                   $("#search_name").val(party);
//                   suggestionsBox.hide();
//                   $("#return_date").focus();
//                 });
//             });
//             suggestionsBox.show();
//           } else {
//             suggestionsBox.hide();
//           }
//         },
//       });
//     } else {
//       suggestionsBox.hide();
//     }
//   });

//   // Keyboard Navigation for Autocomplete
//   $("#search_name").on("keydown", function (e) {
//     let items = $("#suggestions .suggestion-item");

//       if (items.length === 0) return;

//       // 👉 Auto-select if only one suggestion and Enter is pressed
//       if (e.key === "Enter" && items.length === 1) {
//           e.preventDefault();
//           items.eq(0).trigger("click");
//           return;
//       }

//       if (e.key === "ArrowDown") {
//           e.preventDefault();
//           selectedIndex = (selectedIndex + 1) % items.length;
//           items.removeClass("highlight");
//           let selectedItem = items.eq(selectedIndex).addClass("highlight")[0];
//           selectedItem.scrollIntoView({ block: "nearest" });
//       } else if (e.key === "ArrowUp") {
//           e.preventDefault();
//           selectedIndex = (selectedIndex - 1 + items.length) % items.length;
//           items.removeClass("highlight");
//           let selectedItem = items.eq(selectedIndex).addClass("highlight")[0];
//           selectedItem.scrollIntoView({ block: "nearest" });
//       } else if (e.key === "Enter") {
//           e.preventDefault();
//           if (selectedIndex >= 0) {
//               items.eq(selectedIndex).trigger("click");
//           }
//       }
//   });

//   $(document).on("click", function (e) {
//     if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
//   });

//   // Initialize with 5 serials
//   for (let i = 0; i < 3; i++) addSerial(false);
//   const today = new Date().toISOString().slice(0, 10);
//   document.getElementById("return_date").value = today;
// });

// // Helper function to get action of Purchase Form
// // Track which submit button was clicked
// document.querySelectorAll('button[type="submit"]').forEach(btn => {
//   btn.addEventListener('click', function () {
//     // Remove clicked="true" from all submit buttons first
//     document.querySelectorAll('button[type="submit"]').forEach(b => b.removeAttribute('clicked'));
//     // Add clicked="true" only to this one
//     this.setAttribute('clicked', 'true');
//   });
// });

// // navigatePurchaseReturn(action)
// async function navigatePurchaseReturn(action) {
//   try {
//     const currentId = document.getElementById("current_return_id").value || "";

//     const response = await fetch(`/purchaseReturn/get-purchase-return/?action=${action}&current_id=${currentId}`, {
//       method: "GET",
//       headers: { "X-Requested-With": "XMLHttpRequest" },
//     });

//     let data = await response.json();

//     // Handle backend errors
//     if (data.success === false) {
//       Swal.fire({
//         icon: "error",
//         title: "Oops...",
//         text: data.message || "An error occurred while navigating purchase return!",
//       });
//       return;
//     }

//     // Parse JSON string if backend returns nested JSON
//     if (typeof data === "string") {
//       try { data = JSON.parse(data); } catch {}
//     }

//     if (typeof data === "object" && !data.hasOwnProperty("purchase_return_id")) {
//       try {
//         data = JSON.parse(Object.values(data)[0]);
//       } catch {}
//     }

//     renderPurchaseReturnData(data);
//   } catch (error) {
//     console.error("Error navigating purchase return:", error);
//     Swal.fire({
//       icon: "error",
//       title: "Error",
//       text: "An unexpected error occurred while fetching purchase return data.",
//     });
//   }
// }

// // 🧱 renderPurchaseReturnData(data)
// function renderPurchaseReturnData(data) {
//   // 🧾 Update header fields
//   document.getElementById("search_name").value = data.Vendor || "";
//   document.getElementById("return_date").value = data.return_date || "";
//   document.getElementById("current_return_id").value = data.purchase_return_id || "";

//   // Update entry-by badge
//   const entryByName = document.getElementById("entryByName");
//   if (entryByName) entryByName.textContent = data.created_by || "—";

//   // 🧹 Clear existing serial list
//   const serialsDiv = document.getElementById("serials");
//   serialsDiv.innerHTML = "";

//   // 🧩 Render each serial-row
//   if (Array.isArray(data.items)) {
//     data.items.forEach(item => {

//       const row = document.createElement("div");
//       row.className = "serial-row";

//       // Create Item Name (readonly)
//       const itemInput = document.createElement("input");
//       itemInput.type = "text";
//       itemInput.value = item.item_name || "";
//       itemInput.placeholder = "Item Name";
//       itemInput.className = "item-input";
//       itemInput.readOnly = true;

//       // Create Serial Number (readonly)
//       const serialInput = document.createElement("input");
//       serialInput.type = "text";
//       serialInput.value = item.serial_number|| "";
//       serialInput.placeholder = "Serial";
//       serialInput.className = "serial-input";
      

//       // Create item price input (readonly)
//       const itemPrice = document.createElement("input");
//       itemPrice.type = "text";
//       itemPrice.value = item.unit_price|| "";
//       itemPrice.placeholder = "Item Price";
//       itemPrice.className = "item-input";
//       itemPrice.readOnly = true;

//       // ❌ Create remove button
//       const removeBtn = document.createElement("button");
//       removeBtn.innerHTML = "×";
//       removeBtn.className = "remove-btn";
//       removeBtn.title = "Remove this serial";
//       removeBtn.onclick = function () {
//         row.remove();
//         updateCount();
//       };

//       row.appendChild(itemInput);
//       row.appendChild(serialInput);
//       row.appendChild(itemPrice)
//       row.appendChild(removeBtn);
//       serialsDiv.appendChild(row);

//     });
//   }



//   // 🔄 Update button label
//   const submitBtn = document.querySelector("#purchaseReturnForm button[type=submit]");
//   if (data.purchase_return_id) {
//     submitBtn.textContent = "Update Purchase Return";
//   } else {
//     submitBtn.textContent = "Save Purchase Return";
//   }


// }


// const deleteButton = document.querySelector(".delete-btn");

// function confirmDelete(event) {
//   event.preventDefault(); // stop the form from submitting immediately

//   Swal.fire({
//     title: "Are you sure?",
//     text: "This purchase-return will be permanently deleted!",
//     icon: "warning",
//     showCancelButton: true,
//     confirmButtonColor: "#d33",
//     cancelButtonColor: "#3085d6",
//     confirmButtonText: "Yes, delete it!",
//     cancelButtonText: "Cancel"
//   }).then((result) => {
//     if (result.isConfirmed) {
//       // ✅ Temporarily remove this listener so the next click doesn’t reopen the alert
//       deleteButton.removeEventListener("click", confirmDelete);

//       // ✅ Trigger the real submit (calls your buildAndSubmit normally)
//       deleteButton.click();

//       // ✅ Reattach the listener for next time
//       setTimeout(() => {
//         deleteButton.addEventListener("click", confirmDelete);
//       }, 100);
//     }
//   });
// }

// deleteButton.addEventListener("click", confirmDelete);



// // ------------------ Purchase Return Summary (Enhanced UI) ------------------
// async function fetchPurchaseReturnSummary(from = null, to = null) {
//   try {
//     let url = "/purchaseReturn/get-purchase-return-summary/";
//     if (from && to) {
//       url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
//     }

//     const response = await fetch(url);
//     const data = await response.json();

//     if (!data.success && !Array.isArray(data)) {
//       Swal.fire({
//         icon: "error",
//         title: "Error",
//         text: data.message || "Failed to fetch purchase-return summary.",
//       });
//       return;
//     }

//     // ✅ Build the table rows
//     let rows = "";
//     if (Array.isArray(data) && data.length > 0) {
//       data.forEach((purchaseReturn, idx) => {
//         rows += `
//           <tr 
//             class="return-row"
//             data-vendor="${purchaseReturn.vendor.toLowerCase()}"
//             style="cursor:pointer; transition:background 0.2s;"
//             onclick="viewPurchaseReturnDetails(${purchaseReturn.purchase_return_id})"
//             onmouseover="this.style.background='#f3f4f6';"
//             onmouseout="this.style.background='';"
//           >
//             <td>${idx + 1}</td>
//             <td>${purchaseReturn.purchase_return_id}</td>
//             <td>${purchaseReturn.return_date}</td>
//             <td>${purchaseReturn.vendor}</td>
//             <td style="text-align:right;">${purchaseReturn.total_amount.toFixed(2)}</td>
//           </tr>`;
//       });
//     } else {
//       rows = `<tr><td colspan="5" style="text-align:center;">No data found</td></tr>`;
//     }

//     // 🧾 Build styled HTML with search bar
//     const htmlContent = `
//       <style>
//         .return-container {
//           font-family: 'Inter', system-ui, sans-serif;
//           max-height: 450px;
//           overflow-y: auto;
//           padding: 5px;
//           border-radius: 8px;
//         }
//         .return-search {
//           width: 100%;
//           padding: 8px 12px;
//           margin-bottom: 10px;
//           border: 1px solid #d1d5db;
//           border-radius: 8px;
//           font-size: 14px;
//           outline: none;
//           transition: all 0.2s;
//         }
//         .return-search:focus {
//           border-color: #2563eb;
//           box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
//         }
//         table.return-table {
//           width: 100%;
//           border-collapse: collapse;
//           font-size: 14px;
//         }
//         table.return-table th, table.return-table td {
//           padding: 8px 10px;
//           border-bottom: 1px solid #e5e7eb;
//         }
//         table.return-table th {
//           background: #f9fafb;
//           font-weight: 600;
//           color: #374151;
//         }
//         table.return-table tbody tr:hover {
//           background: #f3f4f6;
//         }
//       </style>

//       <input 
//         type="text" 
//         class="return-search" 
//         placeholder="🔍 Search by Vendor name..." 
//         onkeyup="filterPurchaseReturnTable(this.value)" 
//       />

//       <div class="return-container">
//         <table class="return-table">
//           <thead>
//             <tr>
//               <th>#</th>
//               <th>Return ID</th>
//               <th>Date</th>
//               <th>Vendor</th>
//               <th style="text-align:right;">Total Amount</th>
//             </tr>
//           </thead>
//           <tbody id="purchaseReturnSummaryBody">
//             ${rows}
//           </tbody>
//         </table>
//       </div>
//     `;
  
//     // 🎉 SweetAlert popup
//     Swal.fire({
//       title: "📜 Purchase Return Summary",
//       html: htmlContent,
//       width: "750px",
//       confirmButtonText: "Close",
//       showConfirmButton: true,
//       focusConfirm: false,
//       allowOutsideClick: false,
//       allowEnterKey: true,
//       allowEscapeKey: true,
//       didOpen: (popup) => {
//         const input = popup.querySelector(".return-search");

//         document.querySelectorAll("input, textarea, select").forEach(el => el.blur());
//         popup.addEventListener("focusin", e => e.stopPropagation());

//         // Force focus into search field
//         setTimeout(() => {
//           if (input) {
//             input.focus();
//             input.select();
//             setTimeout(() => input.focus(), 400);
//             setTimeout(() => input.focus(), 800);
//           }
//         }, 100);
//       }
//     });

//   } catch (error) {
//     Swal.fire({
//       icon: "error",
//       title: "Network Error",
//       text: error.message || "Unable to fetch purchase-return summary. Please try again!",
//     });
//   }
// }

// // 🔍 Search filter
// function filterPurchaseReturnTable(query) {
//   query = query.toLowerCase().trim();
//   const rows = document.querySelectorAll("#purchaseReturnSummaryBody .return-row");
//   rows.forEach(row => {
//     const vendor = row.dataset.vendor;
//     row.style.display = vendor.includes(query) ? "" : "none";
//   });
// }

// // 🧮 1️⃣ Button: Fetch Last 20 Purchase Returns
// function purchaseReturnHistory() {
//   fetchPurchaseReturnSummary();
// }

// // 📅 2️⃣ Button: Fetch Purchase Returns by Date Range
// function purchaseReturnDateWise() {
//   const today = new Date().toISOString().split("T")[0];
//   Swal.fire({
//     title: "📅 Select Date Range",
//     html: `
//       <label>From Date</label><br>
//       <input type="date" id="fromDate" class="swal2-input" style="width:70%">
//       <br>
//       <label>To Date</label><br>
//       <input type="date" id="toDate" class="swal2-input" style="width:70%" value="${today}">
//     `,
//     focusConfirm: false,
//     showCancelButton: true,
//     confirmButtonText: "Fetch Purchase Returns",
//     preConfirm: () => {
//       const fromDate = document.getElementById("fromDate").value;
//       const toDate = document.getElementById("toDate").value;
//       if (!fromDate || !toDate) {
//         Swal.showValidationMessage("⚠️ Both dates are required");
//         return false;
//       }
//       return { fromDate, toDate };
//     }
//   }).then(result => {
//     if (result.isConfirmed) {
//       const { fromDate, toDate } = result.value;
//       fetchPurchaseReturnSummary(fromDate, toDate);
//     }
//   });
// }

// // 🔹 Open specific return in main UI
// function viewPurchaseReturnDetails(returnId) {
//   document.getElementById("current_return_id").value = returnId;
//   navigatePurchaseReturn("current");
//   Swal.close();
// }

// ============================================================
//  Purchase Return Script — Refactored for professional card UI
// ============================================================

// ── CSRF ────────────────────────────────────────────────────
function getCSRFToken() {
  for (const c of document.cookie.split(";").map(s => s.trim())) {
    if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
  }
  return null;
}

// ── updateCount — FIX: count only .serial-input with non-empty values ──────
function updateCount() {
  const serials = Array.from(document.querySelectorAll("#serials .serial-input"))
    .map(i => i.value.trim())
    .filter(v => v !== "");
  document.getElementById("totalQty").textContent = serials.length;
  recalcAmount();
}

// ── recalcAmount — sum up all price fields ───────────────────────────────────
function recalcAmount() {
  let total = 0;
  document.querySelectorAll("#serials .return-serial-row").forEach(row => {
    const priceEl = row.querySelector(".item-price-input");
    const serial  = row.querySelector(".serial-input");
    if (serial && serial.value.trim() && priceEl) {
      total += parseFloat(priceEl.value) || 0;
    }
  });
  const amountEl = document.getElementById("totalReturnAmount");
  if (amountEl) amountEl.textContent = total.toFixed(2);
}

// ── addSerial — create a styled return-serial-row ────────────────────────────
function addSerial(autoFocus = true) {
  const container = document.getElementById("serials");

  const row = document.createElement("div");
  row.className = "return-serial-row";

  // Serial input (editable)
  const serialInput = document.createElement("input");
  serialInput.type = "text";
  serialInput.placeholder = "Enter Serial Number";
  serialInput.className = "serial-input";
  serialInput.oninput = updateCount;
  serialInput.onkeydown = handleEnterKey;

  // Item name (readonly)
  const itemInput = document.createElement("input");
  itemInput.type = "text";
  itemInput.placeholder = "Item Name";
  itemInput.className = "item-name-input";
  itemInput.readOnly = true;

  // Price (readonly)
  const itemPrice = document.createElement("input");
  itemPrice.type = "text";
  itemPrice.placeholder = "Price";
  itemPrice.className = "item-price-input";
  itemPrice.readOnly = true;

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "return-row-remove";
  removeBtn.title = "Remove this serial";
  removeBtn.innerHTML = "×";
  removeBtn.onclick = () => { row.remove(); updateCount(); };

  // Serial lookup on change
  serialInput.addEventListener("change", function () {
    const val = serialInput.value.trim();
    if (!val) { itemInput.value = ""; itemPrice.value = ""; recalcAmount(); return; }

    fetch(`/purchaseReturn/lookup/${encodeURIComponent(val)}/`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          itemInput.value  = data.item_name || "";
          itemPrice.value  = data.item_price || "";
          serialInput.classList.add("serial-valid");
        } else {
          itemInput.value  = "";
          itemPrice.value  = "";
          serialInput.classList.remove("serial-valid");
          Swal.fire({ icon: "error", title: "Not Found", text: data.message || "Serial not found in stock." });
        }
        recalcAmount();
      })
      .catch(() => Swal.fire({ icon: "error", title: "Error", text: "Failed to fetch serial details." }));
  });

  row.appendChild(serialInput);
  row.appendChild(itemInput);
  row.appendChild(itemPrice);
  row.appendChild(removeBtn);
  container.appendChild(row);

  if (autoFocus) serialInput.focus();
  updateCount();
}

// ── handleEnterKey — move to next serial on Enter ────────────────────────────
function handleEnterKey(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const val = e.target.value.trim();
  if (val) e.target.dispatchEvent(new Event("change"));

  const inputs = Array.from(document.querySelectorAll("#serials .serial-input"));
  const idx = inputs.indexOf(e.target);
  if (idx + 1 < inputs.length) {
    inputs[idx + 1].focus();
  } else {
    addSerial(true);
  }
}

// ── submitReturn ─────────────────────────────────────────────────────────────
function submitReturn(event) {
  event.preventDefault();
  const action = event.target.querySelector('button[type="submit"][clicked="true"]')?.value;

  const partyName = document.getElementById("search_name").value.trim();
  if (!partyName) {
    Swal.fire({ icon: "warning", title: "Missing Party", text: "Enter a party name first." });
    return;
  }

  const returnDate = document.getElementById("return_date").value || new Date().toISOString().slice(0, 10);
  const serials    = Array.from(document.querySelectorAll("#serials .serial-input"))
                       .map(i => i.value.trim()).filter(Boolean);

  if (serials.length === 0) {
    Swal.fire({ icon: "warning", title: "No Serials", text: "Enter at least one serial number." });
    return;
  }

  const payload = {
    return_id:   document.getElementById("current_return_id").value || "",
    party_name:  partyName,
    return_date: returnDate,
    serials,
    action,
    description: (document.getElementById("purchase_return_description")?.value || "").trim()
  };

  fetch("/purchaseReturn/create-purchase-return/", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
    body:    JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    if (data.success)
      Swal.fire({ icon: "success", title: "✅ Success", text: data.message || "Return saved successfully!", timer: 1500, showConfirmButton: false })
          .then(() => window.location.reload());
    else
      Swal.fire({ icon: "error", title: "Error", text: data.message || "Failed to save return." });
  })
  .catch(err => Swal.fire({ icon: "error", title: "Network Error", text: err.message }));
}

// ── renderPurchaseReturnData — populate card from navigation response ──────────
function renderPurchaseReturnData(data) {
  document.getElementById("search_name").value         = data.Vendor || "";
  document.getElementById("return_date").value         = data.return_date || "";
  document.getElementById("current_return_id").value   = data.purchase_return_id || "";
  const _prDescEl = document.getElementById("purchase_return_description");
  if (_prDescEl) _prDescEl.value = data.description || "";

  // ID badge
  const badge = document.getElementById("invoiceIdBadge");
  if (badge) badge.textContent = data.purchase_return_id ? `#${data.purchase_return_id}` : "#NEW";

  // Entry-by badge
  const entryByName = document.getElementById("entryByName");
  if (entryByName) entryByName.textContent = data.created_by || "—";

  // Save/Update button label
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.innerHTML = data.purchase_return_id
    ? '<i class="fa-solid fa-pen-to-square"></i> Update Return'
    : '<i class="fa-solid fa-floppy-disk"></i> Save Return';

  // Rebuild serial rows
  const container = document.getElementById("serials");
  container.innerHTML = "";

  if (Array.isArray(data.items)) {
    data.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "return-serial-row";

      const serialInput = document.createElement("input");
      serialInput.type      = "text";
      serialInput.value     = item.serial_number || "";
      serialInput.className = "serial-input serial-valid";

      const itemInput = document.createElement("input");
      itemInput.type      = "text";
      itemInput.value     = item.item_name || "";
      itemInput.className = "item-name-input";
      itemInput.readOnly  = true;

      const itemPrice = document.createElement("input");
      itemPrice.type      = "text";
      itemPrice.value     = item.unit_price || "";
      itemPrice.className = "item-price-input";
      itemPrice.readOnly  = true;

      const removeBtn = document.createElement("button");
      removeBtn.type      = "button";
      removeBtn.className = "return-row-remove";
      removeBtn.innerHTML = "×";
      removeBtn.onclick   = () => { row.remove(); updateCount(); };

      row.appendChild(serialInput);
      row.appendChild(itemInput);
      row.appendChild(itemPrice);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  updateCount();
}

// ── navigatePurchaseReturn ───────────────────────────────────────────────────
async function navigatePurchaseReturn(action) {
  try {
    const currentId = document.getElementById("current_return_id").value || "";
    const res  = await fetch(`/purchaseReturn/get-purchase-return/?action=${action}&current_id=${currentId}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    let data = await res.json();

    if (data.success === false)
      return Swal.fire({ icon: "info", title: "End of Records",
        text: data.message || "No more purchase returns in this direction.",
        toast: true, position: "top-end", timer: 2000, showConfirmButton: false });

    if (typeof data === "string") { try { data = JSON.parse(data); } catch {} }
    if (typeof data === "object" && !data.hasOwnProperty("purchase_return_id")) {
      try { data = JSON.parse(Object.values(data)[0]); } catch {}
    }
    renderPurchaseReturnData(data);
  } catch (e) {
    Swal.fire({ icon: "error", title: "Error", text: e.message });
  }
}

// ── Delete confirmation ──────────────────────────────────────────────────────
const deleteBtn = document.getElementById("deleteBtn");
function confirmDelete(e) {
  e.preventDefault();
  Swal.fire({
    title: "Are you sure?",
    text:  "This purchase return will be permanently deleted!",
    icon:  "warning",
    showCancelButton:    true,
    confirmButtonColor:  "#d33",
    cancelButtonColor:   "#3085d6",
    confirmButtonText:   "Yes, delete it!"
  }).then(result => {
    if (result.isConfirmed) {
      deleteBtn.removeEventListener("click", confirmDelete);
      deleteBtn.setAttribute("clicked", "true");
      document.getElementById("purchaseReturnForm").requestSubmit(deleteBtn);
      setTimeout(() => deleteBtn.addEventListener("click", confirmDelete), 200);
    }
  });
}
if (deleteBtn) deleteBtn.addEventListener("click", confirmDelete);

// Track clicked submit button
document.querySelectorAll('#purchaseReturnForm button[type="submit"]').forEach(btn => {
  btn.addEventListener("click", function () {
    document.querySelectorAll('#purchaseReturnForm button[type="submit"]').forEach(b => b.removeAttribute("clicked"));
    this.setAttribute("clicked", "true");
  });
});

// ── Autocomplete ─────────────────────────────────────────────────────────────
$(document).ready(function () {
  const autocompleteUrl = $("#search_name").data("autocomplete-url");
  let selectedIndex = -1;

  $("#search_name").on("input", function () {
    const query = $(this).val();
    const box   = $("#suggestions");
    selectedIndex = -1;

    if (query.length >= 1) {
      $.ajax({
        url: autocompleteUrl, data: { term: query }, dataType: "json",
        success: function (data) {
          box.empty();
          if (data.length > 0) {
            data.forEach(name => {
              $("<div>").addClass("suggestion-item").text(name)
                .appendTo(box)
                .on("click", function () {
                  $("#search_name").val(name);
                  box.hide();
                  $("#return_date").focus();
                });
            });
            box.show();
          } else box.hide();
        }
      });
    } else box.hide();
  });

  $("#search_name").on("keydown", function (e) {
    const items = $("#suggestions .suggestion-item");
    if (!items.length) return;
    if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      items.eq(selectedIndex).trigger("click");
    }
  });

  $(document).on("click", e => {
    if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
  });

  // Initialise with 3 blank rows
  for (let i = 0; i < 3; i++) addSerial(false);
  document.getElementById("return_date").value = new Date().toISOString().slice(0, 10);
});

// ── History / Date-wise modals ────────────────────────────────────────────────
async function fetchPurchaseReturnSummary(from = null, to = null) {
  try {
    let url = "/purchaseReturn/get-purchase-return-summary/";
    if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const data = await fetch(url).then(r => r.json());

    if (!data.success && !Array.isArray(data))
      return Swal.fire({ icon: "error", title: "Error", text: data.message || "Failed to fetch summary." });

    let rows = "";
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((pr, idx) => {
        rows += `
          <tr onclick="viewPurchaseReturnDetails(${pr.purchase_return_id})"
              style="cursor:pointer;"
              onmouseover="this.style.background='#f3f4f6';"
              onmouseout="this.style.background='';">
            <td>${idx + 1}</td>
            <td>${pr.purchase_return_id}</td>
            <td>${pr.return_date}</td>
            <td>${pr.vendor}</td>
            <td style="text-align:right;">${parseFloat(pr.total_amount).toFixed(2)}</td>
          </tr>`;
      });
    } else {
      rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
    }

    const html = `
      <style>
        .pr-wrap { max-height:420px; overflow-y:auto; }
        .pr-search { width:100%; padding:8px 12px; margin-bottom:10px; border:1px solid #d1d5db;
                     border-radius:8px; font-size:14px; outline:none; }
        .pr-search:focus { border-color:#7c3aed; box-shadow:0 0 0 2px rgba(124,58,237,0.1); }
        .pr-table { width:100%; border-collapse:collapse; font-size:13px; }
        .pr-table th,.pr-table td { padding:8px 10px; border-bottom:1px solid #e5e7eb; }
        .pr-table th { background:#f9fafb; font-weight:600; color:#374151; }
      </style>
      <input class="pr-search" placeholder="🔍 Search by vendor…" oninput="filterPurchaseReturnTable(this.value)">
      <div class="pr-wrap">
        <table class="pr-table">
          <thead><tr><th>#</th><th>Return ID</th><th>Date</th><th>Vendor</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody id="purchaseReturnSummaryBody">${rows}</tbody>
        </table>
      </div>`;

    Swal.fire({
      title: "↩️ Purchase Return History", html, width: "750px",
      confirmButtonText: "Close", showConfirmButton: true,
      allowEscapeKey: true, allowOutsideClick: false,
      didOpen: popup => {
        const input = popup.querySelector(".pr-search");
        setTimeout(() => { if (input) input.focus(); }, 100);
      }
    });
  } catch (err) {
    Swal.fire({ icon: "error", title: "Network Error", text: err.message });
  }
}

function filterPurchaseReturnTable(q) {
  q = q.toLowerCase().trim();
  document.querySelectorAll("#purchaseReturnSummaryBody tr").forEach(r =>
    r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"
  );
}

function purchaseReturnHistory()  { fetchPurchaseReturnSummary(); }

function purchaseReturnDateWise() {
  const today = new Date().toISOString().split("T")[0];
  Swal.fire({
    title: "📅 Select Date Range",
    html: `<label>From Date</label><br>
           <input type="date" id="fromDate" class="swal2-input" style="width:70%">
           <br><label>To Date</label><br>
           <input type="date" id="toDate" class="swal2-input" style="width:70%" value="${today}">`,
    focusConfirm: false, showCancelButton: true, confirmButtonText: "Fetch Purchase Returns",
    preConfirm: () => {
      const from = document.getElementById("fromDate").value;
      const to   = document.getElementById("toDate").value;
      if (!from || !to) { Swal.showValidationMessage("⚠️ Both dates are required"); return false; }
      return { from, to };
    }
  }).then(r => { if (r.isConfirmed) fetchPurchaseReturnSummary(r.value.from, r.value.to); });
}

function viewPurchaseReturnDetails(id) {
  document.getElementById("current_return_id").value = id;
  navigatePurchaseReturn("current");
  Swal.close();
}

// ── PDF Download ──────────────────────────────────────────────────────────────
function downloadReturnPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { Swal.fire({ icon: "error", title: "PDF Error", text: "PDF library not loaded." }); return; }

  const returnId  = document.getElementById("current_return_id").value || "NEW";
  const vendor    = document.getElementById("search_name").value || "—";
  const date      = document.getElementById("return_date").value || "—";
  const totalSerials = document.getElementById("totalQty").textContent;
  const totalAmt  = document.getElementById("totalReturnAmount")?.textContent || "0.00";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 18;

  // Header band
  doc.setFillColor(76, 29, 149);
  doc.rect(0, 0, W, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text("Purchase Return Invoice", margin, 16);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Return #${returnId}`, margin, 24);
  doc.text(`Date: ${date}`, margin, 30);

  // Meta
  doc.setTextColor(30, 30, 30);
  let y = 48;
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("Vendor:", margin, y); doc.setFont("helvetica", "normal"); doc.text(vendor, margin + 22, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Total Serials:", margin, y); doc.setFont("helvetica", "normal"); doc.text(String(totalSerials), margin + 36, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Return Amount:", margin, y); doc.setFont("helvetica", "normal"); doc.text(`PKR ${totalAmt}`, margin + 38, y);
  y += 14;

  // Table header
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, W - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("#",       margin + 2,  y + 5.5);
  doc.text("Serial",  margin + 10, y + 5.5);
  doc.text("Item",    margin + 60, y + 5.5);
  doc.text("Price",   margin + 130, y + 5.5);
  y += 10;

  const rows = document.querySelectorAll("#serials .return-serial-row");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  let idx = 0;
  rows.forEach(row => {
    const serial = row.querySelector(".serial-input")?.value.trim();
    const item   = row.querySelector(".item-name-input")?.value.trim();
    const price  = row.querySelector(".item-price-input")?.value.trim();
    if (!serial) return;
    idx++;
    if (idx % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(margin, y - 1, W - margin * 2, 7, "F"); }
    doc.setTextColor(30, 30, 30);
    doc.text(String(idx),   margin + 2,  y + 4);
    doc.text(serial,        margin + 10, y + 4, { maxWidth: 48 });
    doc.text(item || "—",  margin + 60, y + 4, { maxWidth: 68 });
    doc.text(price || "—", margin + 130, y + 4);
    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  // Footer line
  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, W - margin, y);
  y += 6;
  doc.setFontSize(8); doc.setTextColor(130, 130, 130);
  doc.text("Generated Generated by Financee Accounting Management", margin, y);
  doc.text(`PKR ${totalAmt}`, W - margin, y, { align: "right" });

  doc.save(`PurchaseReturn_${returnId}.pdf`);
}