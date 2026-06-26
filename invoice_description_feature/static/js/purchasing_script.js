


// // ============================================================
// // FUNCTION: updateQty (UPDATED)
// // ============================================================
// function updateQty(row) {
//   // Count only filled serial-number inputs (not comment inputs)
//   const serialInputs = row.querySelectorAll(".serials .serial-number");
//   const qtyBox = row.querySelector(".qty-box");
//   let count = 0;
//   serialInputs.forEach(input => {
//     if (input.value.trim() !== "") count++;
//   });
//   qtyBox.value = count;
//   calculateTotal();
// }



// // ============================================================
// // FUNCTION: addSerial (UPDATED)
// // ============================================================
// function addSerial(row, autoFocus = true, serialData = null) {
//   const serialsDiv = row.querySelector(".serials");
  
//   // Create wrapper div for serial + comment
//   const wrapper = document.createElement("div");
//   wrapper.className = "serial-wrapper";
  
//   // Create serial number input
//   const serialInput = document.createElement("input");
//   serialInput.type = "text";
//   serialInput.className = "serial-number";
//   serialInput.placeholder = "Serial Number";
//   serialInput.oninput = () => updateQty(row);
//   serialInput.onkeydown = (e) => handleEnterKey(e, serialInput, wrapper);
  
//   // Create comment input
//   const commentInput = document.createElement("input");
//   commentInput.type = "text";
//   commentInput.className = "serial-comment";
//   commentInput.placeholder = "Comment (optional)";
//   commentInput.maxLength = 500; // Frontend restriction (~2 lines)
//   commentInput.onkeydown = (e) => handleEnterKey(e, commentInput, wrapper);
  
//   // Pre-fill if data provided (for update mode)
//   if (serialData) {
//     if (typeof serialData === 'string') {
//       // Old format: just serial number
//       serialInput.value = serialData;
//     } else if (typeof serialData === 'object' && serialData !== null) {
//       // New format: {serial: "...", comment: "..."}
//       serialInput.value = serialData.serial || '';
//       commentInput.value = serialData.comment || '';
//     }
//   }
  
//   wrapper.appendChild(serialInput);
//   wrapper.appendChild(commentInput);
//   serialsDiv.appendChild(wrapper);
//   updateQty(row);

//   if (autoFocus) {
//     serialInput.focus();
//   }
// }


// // ============================================================
// // FUNCTION: removeSerial (UPDATED)
// // ============================================================
// function removeSerial(row) {
//   const serialsDiv = row.querySelector(".serials");
//   if (serialsDiv.lastChild) {
//     serialsDiv.removeChild(serialsDiv.lastChild); // Remove wrapper div
//     updateQty(row);

//     // Focus handling - now works with wrappers
//     const remaining = serialsDiv.querySelectorAll(".serial-wrapper");
//     if (remaining.length > 0) {
//       const lastWrapper = remaining[remaining.length - 1];
//       const lastSerialInput = lastWrapper.querySelector(".serial-number");
//       if (lastSerialInput) {
//         lastSerialInput.focus();
//       }
//     } else {
//       row.querySelector(".add-serial").focus(); // fallback
//     }
//   }
// }
// // <input type="text" class="item_name" placeholder="Item name"></input>

// function addItemRow(shouldFocus = true) {
//   const itemsDiv = document.getElementById("items");

//   const row = document.createElement("div");
//   row.className = "item-row";
//   row.innerHTML = `
    
//     <div class="item_name_field autocomplete-container">
//         <input type="text" class="item_name item_search_name" placeholder="Item name"
//               autocomplete="off"
//               data-autocomplete-url="${autocompleteItemUrl}">
//         <div class="items_suggestions"></div>
//     </div>
//     <input type="number" class="unit_price" step="0.01" placeholder="Unit price">
//     <input type="number" class="qty-box" readonly value="0">
//     <div class="serials"></div>
//     <button type="button" class="custom-btn add-serial">+ Serial</button>
//     <button type="button" class="custom-btn remove-serial">- Serial</button>
//     <button type="button" class="custom-btn remove-item">Remove</button>
//   `;

//   row.querySelector(".add-serial").onclick = () => addSerial(row);
//   row.querySelector(".remove-serial").onclick = () => removeSerial(row);
//   row.querySelector(".remove-item").onclick = () => { row.remove(); calculateTotal(); };
//   row.querySelector(".unit_price").oninput = () => calculateTotal();

//   itemsDiv.appendChild(row);
//   enforceSequentialValidation();

//   addSerial(row,false);

//   // Only focus item_name if shouldFocus is true
//   if (shouldFocus) {
//     row.querySelector(".item_name").focus();
//   }
// }

// function calculateTotal() {
//   let total = 0;
//   const rows = document.querySelectorAll(".item-row");
//   rows.forEach(row => {
//     const unit_price = parseFloat(row.querySelector(".unit_price").value) || 0;
//     const qty = parseInt(row.querySelector(".qty-box").value) || 0;
//     total += unit_price * qty;
//   });
//   document.getElementById("totalAmount").textContent = total.toFixed(2);
// }

// function getCSRFToken() {
//   const name = "csrftoken";
//   const cookies = document.cookie.split(";").map(c => c.trim());
//   for (let c of cookies) {
//     if (c.startsWith(name + "=")) {
//       return decodeURIComponent(c.split("=")[1]);
//     }
//   }
//   return null;
// }


// // ============================================================
// // FUNCTION: buildAndSubmit (UPDATED)
// // ============================================================
// function buildAndSubmit(event) {
//   event.preventDefault();
//   const form = event.target;
//   const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

//   const partyName = document.getElementById("search_name").value.trim();
//   let purchaseDate = document.getElementById("purchase_date").value;
//   if (!purchaseDate) {
//     purchaseDate = new Date().toISOString().slice(0,10);
//   }
  
//   if (!partyName) {
//     Swal.fire({
//       icon: "warning",
//       title: "Missing Party Name",
//       text: "Please enter the party name before submitting.",
//       confirmButtonText: "OK"
//     });
//     document.getElementById("search_name").focus();
//     return;
//   }
  
//   const items = [];
//   const rows = document.querySelectorAll(".item-row");
//   rows.forEach(row => {
//     const item_name = row.querySelector(".item_name").value.trim();
//     const unit_price = parseFloat(row.querySelector(".unit_price").value);
    
//     // Build serials array with serial + comment
//     const serialWrappers = Array.from(row.querySelectorAll(".serials .serial-wrapper"));
//     const serials = serialWrappers
//       .map(wrapper => {
//         const serialInput = wrapper.querySelector(".serial-number");
//         const commentInput = wrapper.querySelector(".serial-comment");
//         const serialValue = serialInput ? serialInput.value.trim() : '';
//         const commentValue = commentInput ? commentInput.value.trim() : '';
        
//         if (serialValue) {
//           return {
//             serial: serialValue,
//             comment: commentValue || null
//           };
//         }
//         return null;
//       })
//       .filter(s => s !== null);
    
//     const qty = serials.length;

//     if (item_name && qty > 0 && !isNaN(unit_price) && unit_price > 0) {
//       items.push({ item_name, qty, unit_price, serials });
//     }
//   });
  
//   if (items.length === 0) {
//     Swal.fire({
//       icon: "warning",
//       title: "Invalid Items",
//       text: "Please enter at least one valid item with name, unit price, and serial(s).",
//       confirmButtonText: "OK"
//     });
//     return;
//   }

//   const payload = {
//     party_name: partyName,
//     purchase_date: purchaseDate,
//     items: items,
//     action: action
//   };
  
//   const current_id = document.getElementById("current_purchase_id")?.value;
//   if (current_id) {
//     payload.purchase_id = current_id;
//   }
  
//   console.log("Submitting payload:", payload);
  
//   const csrftoken = getCSRFToken();
//   fetch(window.location.href, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-CSRFToken": csrftoken
//     },
//     body: JSON.stringify(payload)
//   })
//   .then(response => response.json())
//   .then(data => {
//     if (data.success) {
//       Swal.fire({
//         icon: "success",
//         title: "Success",
//         text: data.message || "Purchase saved successfully!",
//         confirmButtonText: "OK"
//       }).then(() => {
//         if (action === "delete") {
//           window.location.href = window.location.href.split('?')[0];
//         } else {
//           location.reload();
//         }
//       });
//     } else {
//       Swal.fire({
//         icon: "error",
//         title: "Error",
//         text: data.message || "An error occurred.",
//         confirmButtonText: "OK"
//       });
//     }
//   })
//   .catch(error => {
//     console.error("Error:", error);
//     Swal.fire({
//       icon: "error",
//       title: "Network Error",
//       text: "Could not connect to server.",
//       confirmButtonText: "OK"
//     });
//   });
// }

// document.querySelectorAll('button[type="submit"]').forEach(btn => {
//   btn.addEventListener('click', function() {
//     // Remove 'clicked' from all buttons
//     document.querySelectorAll('button[type="submit"]').forEach(b => b.removeAttribute('clicked'));
//     // Mark the one that was clicked
//     this.setAttribute('clicked', 'true');
//   });
// });

// window.onload = function() {
//   for (let i = 0; i < 3; i++) addItemRow(false);
//   enforceSequentialValidation();
//   const today = new Date().toISOString().slice(0, 10);
//   document.getElementById("purchase_date").value = today;
// };



// function handleEnterKey(e, input, wrapper) {
//   if (e.key === "Enter") {
//     e.preventDefault();
    
//     // Handle serial/comment navigation (new)
//     if (input.classList.contains("serial-number")) {
//       const commentInput = wrapper.querySelector(".serial-comment");
//       if (commentInput) {
//         commentInput.focus();
//       }
//     } 
//     else if (input.classList.contains("serial-comment")) {
//       const row = input.closest(".item-row");
//       if (row) {
//         addSerial(row, true);
//       }
//     }
//     // Handle regular input navigation (restored)
//     else {
//       if (!input.value.trim() && !input.classList.contains("qty-box")) {
//         input.focus();
//         return;
//       }
//       const formInputs = Array.from(document.querySelectorAll("input, select, textarea"))
//         .filter(el => !el.hasAttribute("readonly") && !el.classList.contains("serial-comment"));
//       const index = formInputs.indexOf(input);
//       if (index > -1 && index < formInputs.length - 1) {
//         formInputs[index + 1].focus();
//       }
//     }
//   }
// }



// function enforceSequentialValidation() {
//   const inputs = document.querySelectorAll("input:not(.serial-number):not(.serial-comment), select, textarea");
//   inputs.forEach(input => {
//     input.onkeydown = (e) => {
//       if (e.key === "Enter") {
//         handleEnterKey(e, input);
//       }
//     };
//   });
// }


// $(document).ready(function () {
//     let autocompleteUrl = $("#search_name").data("autocomplete-url");
//     let selectedIndex = -1; // for keyboard navigation

//     $("#search_name").on("input", function () {
//         let query = $(this).val();
//         let suggestionsBox = $("#suggestions");
//         selectedIndex = -1; // reset when typing

//         if (query.length >= 1) {
//             $.ajax({
//                 url: autocompleteUrl,
//                 data: { term: query },
//                 dataType: "json",
//                 success: function (data) {
//                     suggestionsBox.empty();
//                     if (data.length > 0) {
//                         data.forEach(function (party) {
//                             $("<div>")
//                                 .addClass("suggestion-item")
//                                 .text(party)
//                                 .css({
//                                     padding: "5px",
//                                     cursor: "pointer",
//                                     borderBottom: "1px solid #ddd",
//                                 })
//                                 .appendTo(suggestionsBox)
//                                 .on("click", function () {
//                                     $("#search_name").val(party);
//                                     suggestionsBox.hide();
//                                     $("#purchase_date").focus(); // move to next field
//                                 });
//                         });
//                         suggestionsBox.show();
//                     } else {
//                         suggestionsBox.hide();
//                     }
//                 },
//             });
//         } else {
//             suggestionsBox.hide();
//         }
//     });

//     // Keyboard navigation with auto-scroll
//     $("#search_name").on("keydown", function (e) {
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

//     $(document).on("click", function (e) {
//         if (!$(e.target).closest("#search_name, #suggestions").length) {
//             $("#suggestions").hide();
//         }
//     });
// });


// // suggestionsBox for item names
// let selectedIndex = -1; // track highlighted suggestion per input

// // Autocomplete input event
// $(document).on("input", ".item_search_name", function () {
//     let input = $(this);
//     let query = input.val();
//     let suggestionsBox = input.siblings(".items_suggestions");
//     let autocompleteUrl = input.data("autocomplete-url");
//     selectedIndex = -1; // reset index when typing

//     if (query.length >= 1) {
//         $.ajax({
//             url: autocompleteUrl,
//             data: { term: query },
//             dataType: "json",
//             success: function (data) {
//                 suggestionsBox.empty();
//                 if (data.length > 0) {
//                     data.forEach(function (item) {
//                         $("<div>")
//                             .addClass("suggestion-item")
//                             .text(item)
//                             .css({
//                                 padding: "5px",
//                                 cursor: "pointer",
//                                 borderBottom: "1px solid #ddd",
//                             })
//                             .appendTo(suggestionsBox)
//                             .on("click", function () {
//                                 input.val(item);
//                                 suggestionsBox.hide();
//                                 // Move focus to next field in the row (unit price)
//                                 input.closest(".item-row").find(".unit_price").focus();
//                             });
//                     });
//                     suggestionsBox.show();
//                 } else {
//                     suggestionsBox.hide();
//                 }
//             },
//         });
//     } else {
//         suggestionsBox.hide();
//     }
// });

// // Keyboard navigation with auto-scroll
// $(document).on("keydown", ".item_search_name", function (e) {
//     let input = $(this);
//     let suggestionsBox = input.siblings(".items_suggestions");
//     let items = suggestionsBox.find(".suggestion-item");

//     if (items.length === 0) return;

//     // 👉 Auto-select if only one suggestion and Enter is pressed
//     if (e.key === "Enter" && items.length === 1) {
//         e.preventDefault();
//         items.eq(0).trigger("click");
//         return;
//     }

//     if (e.key === "ArrowDown") {
//         e.preventDefault();
//         selectedIndex = (selectedIndex + 1) % items.length;
//         items.removeClass("highlight");
//         let selectedItem = items.eq(selectedIndex).addClass("highlight")[0];
//         selectedItem.scrollIntoView({ block: "nearest" });
//     } else if (e.key === "ArrowUp") {
//         e.preventDefault();
//         selectedIndex = (selectedIndex - 1 + items.length) % items.length;
//         items.removeClass("highlight");
//         let selectedItem = items.eq(selectedIndex).addClass("highlight")[0];
//         selectedItem.scrollIntoView({ block: "nearest" });
//     } else if (e.key === "Enter") {
//         e.preventDefault();
//         if (selectedIndex >= 0) {
//             items.eq(selectedIndex).trigger("click");
//         }
//     }
// });

// // Hide dropdown when clicking outside
// $(document).on("click", function (e) {
//     if (!$(e.target).closest(".item_search_name, .items_suggestions").length) {
//         $(".items_suggestions").hide();
//     }
// });





// async function navigatePurchase(action) {

//   try {
//     const currentId = document.getElementById("current_purchase_id").value || "";

//     // Fetch from Django view
//     const response = await fetch(`/purchase/get-purchase/?action=${action}&current_id=${currentId}`, {
//       method: "GET",
//       headers: {
//         "X-Requested-With": "XMLHttpRequest",
//       },
//     });

//     let data = await response.json();


//     // Handle backend errors
//     if (data.success === false) {
//       Swal.fire({
//         icon: "error",
//         title: "Oops...",
//         text: data.message || "An error occurred!",
//       });
//       return;
//     }

//     // Parse JSON string coming from backend
//     if (typeof data === "string") {
//       data = JSON.parse(data);
//     }

//     // If Django wrapped the JSON in data.result_data[0] or similar, parse accordingly
//     if (typeof data === "object" && data.hasOwnProperty("purchase_invoice_id") === false) {
//       try {
//         data = JSON.parse(Object.values(data)[0]);
//       } catch (e) {}
//     }

//     renderPurchaseData(data);
//   } catch (error) {
//     console.error("Error navigating purchase:", error);
//     Swal.fire({
//       icon: "error",
//       title: "Error",
//       text: "An unexpected error occurred while fetching purchase data.",
//     });
//   }
// }

// // function renderPurchaseData(data) {

// function renderPurchaseData(data) {
//   // Update header fields
//   document.getElementById("search_name").value = data.Party || "";
//   document.getElementById("purchase_date").value = data.invoice_date || "";
//   document.getElementById("current_purchase_id").value = data.purchase_invoice_id || "";

//   // Clear existing items
//   const itemsDiv = document.getElementById("items");
//   itemsDiv.innerHTML = "";
//   // Render each item row in the same structure as addItemRow()
//   if (Array.isArray(data.items)) {
//     data.items.forEach((item) => {
//       const row = document.createElement("div");
//       row.className = "item-row";
//       row.innerHTML = `
//         <div class="item_name_field autocomplete-container">
//             <input type="text" class="item_name item_search_name" 
//                 placeholder="Item name" 
//                 value="${item.item_name || ""}"
//                 autocomplete="off"
//                 data-autocomplete-url="${autocompleteItemUrl}">
//             <div class="items_suggestions"></div>
//         </div>
//         <input type="number" class="unit_price" step="0.01" placeholder="Unit price" value="${item.unit_price || 0}">
//         <input type="number" class="qty-box" readonly value="${item.qty || 0}">
//         <div class="serials"></div>
//         <button type="button" class="custom-btn add-serial">+ Serial</button>
//         <button type="button" class="custom-btn remove-serial">- Serial</button>
//         <button type="button" class="custom-btn remove-item">Remove</button>
//       `;

//       // Bind button actions (reuse same logic)
//       row.querySelector(".add-serial").onclick = () => addSerial(row);
//       row.querySelector(".remove-serial").onclick = () => removeSerial(row);
//       row.querySelector(".remove-item").onclick = () => { row.remove(); calculateTotal(); };
//       row.querySelector(".unit_price").oninput = () => calculateTotal();

//       // Append serials
//       const serialsDiv = row.querySelector(".serials");
//       // NEW CODE (CORRECT)
//       if (Array.isArray(item.serials)) {
//         item.serials.forEach(serialData => {
//           addSerial(row, false, serialData);  // ✅ addSerial handles both formats
//         });
//       }
//       // update button text
//       let submitBtn = document.querySelector("#purchaseForm button[type=submit]");
//       if (data.purchase_invoice_id) {
//           submitBtn.textContent = "Update Purchase";
//       } else {
//           submitBtn.textContent = "Save Purchase";
//       }

//       itemsDiv.appendChild(row);
//       updateQty(row);
//     });
//   }

//   // Update total amount
//   document.getElementById("totalAmount").textContent =
//     data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";


// }


// const deleteButton = document.querySelector(".delete-btn");

// function confirmDelete(event) {
//   event.preventDefault(); // stop the form from submitting immediately

//   Swal.fire({
//     title: "Are you sure?",
//     text: "This purchase will be permanently deleted!",
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



// // // ------------------ Purchase Invoices Summary--------------------------------
// // // Generic fetch function for purchase summaries

// // ------------------ Purchase Invoices Summary (Enhanced UI) ------------------
// async function fetchPurchaseSummary(from = null, to = null) {
//   try {
//     let url = "/purchase/get-purchase-summary/";
//     if (from && to) {
//       url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
//     }

//     const response = await fetch(url);
//     const data = await response.json();

//     if (!data.success && !Array.isArray(data)) {
//       Swal.fire({
//         icon: "error",
//         title: "Error",
//         text: data.message || "Failed to fetch purchase summary.",
//       });
//       return;
//     }

//     // ✅ Build the table rows
//     let rows = "";
//     if (Array.isArray(data) && data.length > 0) {
//       data.forEach((purchase, idx) => {
//         rows += `
//           <tr 
//             class="purchase-row"
//             data-vendor="${purchase.vendor.toLowerCase()}"
//             style="cursor:pointer; transition:background 0.2s;"
//             onclick="viewPurchaseDetails(${purchase.purchase_invoice_id})"
//             onmouseover="this.style.background='#f3f4f6';"
//             onmouseout="this.style.background='';"
//           >
//             <td>${idx + 1}</td>
//             <td>${purchase.purchase_invoice_id}</td>
//             <td>${purchase.invoice_date}</td>
//             <td>${purchase.vendor}</td>
//             <td style="text-align:right;">${purchase.total_amount.toFixed(2)}</td>
//           </tr>`;
//       });
//     } else {
//       rows = `<tr><td colspan="5" style="text-align:center;">No data found</td></tr>`;
//     }

//     // 🧾 Build styled HTML with search bar
//     const htmlContent = `
//       <style>
//         .purchase-container {
//           font-family: 'Inter', system-ui, sans-serif;
//           max-height: 450px;
//           overflow-y: auto;
//           padding: 5px;
//           border-radius: 8px;
//         }
//         .purchase-search {
//           width: 100%;
//           padding: 8px 12px;
//           margin-bottom: 10px;
//           border: 1px solid #d1d5db;
//           border-radius: 8px;
//           font-size: 14px;
//           outline: none;
//           transition: all 0.2s;
//         }
//         .purchase-search:focus {
//           border-color: #2563eb;
//           box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
//         }
//         table.purchase-table {
//           width: 100%;
//           border-collapse: collapse;
//           font-size: 14px;
//         }
//         table.purchase-table th, table.purchase-table td {
//           padding: 8px 10px;
//           border-bottom: 1px solid #e5e7eb;
//         }
//         table.purchase-table th {
//           background: #f9fafb;
//           font-weight: 600;
//           color: #374151;
//         }
//         table.purchase-table tbody tr:hover {
//           background: #f3f4f6;
//         }
//       </style>

//       <input 
//         type="text" 
//         class="purchase-search" 
//         placeholder="🔍 Search by Vendor name..." 
//         onkeyup="filterPurchaseTable(this.value)" 
//       />

//       <div class="purchase-container">
//         <table class="purchase-table">
//           <thead>
//             <tr>
//               <th>#</th>
//               <th>Invoice ID</th>
//               <th>Date</th>
//               <th>Vendor</th>
//               <th style="text-align:right;">Total Amount</th>
//             </tr>
//           </thead>
//           <tbody id="purchaseSummaryBody">
//             ${rows}
//           </tbody>
//         </table>
//       </div>
//     `;
  
//     // Helper to temporarily disable background focus
//     function disableBackgroundFocus() {
//       const inputs = document.querySelectorAll("input, textarea, select, [tabindex]");
//       inputs.forEach(el => {
//         el.dataset.prevTabindex = el.getAttribute("tabindex");
//         el.setAttribute("tabindex", "-1");
//       });
//     }

//     // Restore focus when popup closes
//     function enableBackgroundFocus() {
//       const inputs = document.querySelectorAll("input, textarea, select, [tabindex]");
//       inputs.forEach(el => {
//         if (el.dataset.prevTabindex !== undefined) {
//           el.setAttribute("tabindex", el.dataset.prevTabindex);
//           delete el.dataset.prevTabindex;
//         } else {
//           el.removeAttribute("tabindex");
//         }
//       });
//     }
//     // 🎉 SweetAlert popup
//     disableBackgroundFocus();

//     Swal.fire({
//       title: "📜 Purchase Summary",
//       html: htmlContent,
//       width: "750px",
//       confirmButtonText: "Close",
//       showConfirmButton: true,
//       focusConfirm: false,
//       allowOutsideClick: false,
//       allowEnterKey: true,
//       allowEscapeKey: true,
//       didOpen: (popup) => {
//         const input = popup.querySelector(".purchase-search");

//         // 🧠 Stop all background inputs from catching focus events
//         document.querySelectorAll("input, textarea, select").forEach(el => {
//           el.blur();
//         });

//         // 🛑 Stop event bubbling that can cause refocus
//         popup.addEventListener("focusin", e => e.stopPropagation());
//         popup.addEventListener("keydown", e => e.stopPropagation());

//         // 🧩 Try multiple ways to force focus after rendering
//         setTimeout(() => {
//           if (input) {
//             input.focus();
//             input.select();
//             // 👇 Forcefully focus again a bit later in case other scripts interfere
//             setTimeout(() => input.focus(), 400);
//             setTimeout(() => input.focus(), 800);
//           }
//         }, 100);
//       },

//       willClose: () => {
//         // Re-enable background focus when popup closes
//         enableBackgroundFocus();
//       }
//     });



//   } catch (error) {
//     Swal.fire({
//       icon: "error",
//       title: "Network Error",
//       text: error.message || "Unable to fetch purchase summary. Please try again!",
//     });
//   }
// }

// function filterPurchaseTable(query) {
//   query = query.toLowerCase().trim();
//   const rows = document.querySelectorAll("#purchaseSummaryBody .purchase-row");
//   rows.forEach(row => {
//     const vendor = row.dataset.vendor;
//     row.style.display = vendor.includes(query) ? "" : "none";
//   });
// }

// // 🧮 1️⃣ Button: Fetch Last 20 Purchases
// function purchaseHistory() {
//   fetchPurchaseSummary();
// }

// // 📅 2️⃣ Button: Fetch Purchases by Date Range
// function purchaseDateWise() {
//   const today = new Date().toISOString().split("T")[0];
//     Swal.fire({
//         title: "📅 Select Date Range",
//         html: `
//             <label>From Date</label><br>
//             <input type="date" id="fromDate" class="swal2-input" style="width:70%">
//             <br>
//             <label>To Date</label><br>
//             <input type="date" id="toDate" class="swal2-input" style="width:70%" value="${today}">
//         `,
//         focusConfirm: false,
//         showCancelButton: true,
//         confirmButtonText: "Fetch Purchases",
//         preConfirm: () => {
//             const fromDate = document.getElementById("fromDate").value;
//             const toDate = document.getElementById("toDate").value;
//             if (!fromDate || !toDate) {
//                 Swal.showValidationMessage("⚠️ Both dates are required");
//                 return false;
//             }
//             return { fromDate, toDate };
//         }
//     }).then(result => {
//         if (result.isConfirmed) {
//             const { fromDate, toDate } = result.value;

//             fetchPurchaseSummary(fromDate, toDate);
//         }
//     });
// }

// // 🔹 New function to handle click on a purchase row
// function viewPurchaseDetails(purchaseId) {
//   document.getElementById("current_purchase_id").value = purchaseId;
//   navigatePurchase("current")
//   Swal.close();
// }


// // ============================================================
// // FUNCTION: loadPurchaseData (UPDATED)
// // ============================================================
// // This function is called when navigating to existing purchases
// // Update the section where serials are populated

// function loadPurchaseData(data) {
//   // Clear existing items
//   const itemsDiv = document.getElementById("items");
//   itemsDiv.innerHTML = "";
  
//   // Set party name and date
//   document.getElementById("search_name").value = data.Party || "";
//   document.getElementById("purchase_date").value = data.invoice_date || "";
//   document.getElementById("current_purchase_id").value = data.purchase_invoice_id || "";
  
//   // Load items
//   if (data.items && Array.isArray(data.items)) {
//     data.items.forEach(item => {
//       const itemRow = document.createElement("div");
//       itemRow.className = "item-row";
//       itemRow.innerHTML = `
//         <div class="item_name_field autocomplete-container">
//           <input type="text" class="item_name item_search_name" 
//                  placeholder="Item name" autocomplete="off"
//                  data-autocomplete-url="${autocompleteItemUrl}">
//           <div class="items_suggestions"></div>
//         </div>
//         <input type="number" class="unit_price" placeholder="Unit price">
//         <input type="number" class="qty-box" readonly value="0">
//         <div class="serials"></div>
//         <button type="button" class="custom-btn add-serial">+ Serial</button>
//         <button type="button" class="custom-btn remove-serial">- Serial</button>
//         <button type="button" class="custom-btn remove-item">Remove</button>
//       `;
      
//       itemRow.querySelector(".add-serial").onclick = () => addSerial(itemRow);
//       itemRow.querySelector(".remove-serial").onclick = () => removeSerial(itemRow);
//       itemRow.querySelector(".remove-item").onclick = () => { 
//         itemRow.remove(); 
//         calculateTotal(); 
//       };
//       itemRow.querySelector(".unit_price").oninput = () => calculateTotal();
      
//       itemsDiv.appendChild(itemRow);
      
//       // Set item details
//       itemRow.querySelector(".item_name").value = item.item_name || "";
//       itemRow.querySelector(".unit_price").value = item.unit_price || "";
      
//       // Load serials with comments
//       if (item.serials && Array.isArray(item.serials)) {
//         item.serials.forEach(serialData => {
//           addSerial(itemRow, false, serialData);
//         });
//       }
      
//       enforceSequentialValidation();
//     });
//   }
  
//   calculateTotal();
// }


/* ============================================================
   PURCHASE PAGE — COMPLETE SCRIPT
   Features:
     - Fuzzy item autocomplete (substring match, starts-with ranked first)
     - Bulk serial paste per row (item must be selected first)
     - Serial comments default to "All Ok"
     - Instant duplicate detection: within-invoice AND stock history
     - Total Items / Total Qty / Total Amount
     - PDF download (PKR currency)
     - Previous / Next / Current navigation
     - Purchase history summary popup
   ============================================================ */

// // ── Utilities ──────────────────────────────────────────────────────────────
// function _norm(s) { return (s == null ? "" : String(s)).trim(); }

// function escapeHtml(s) {
//   return String(s == null ? "" : s)
//     .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
//     .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
// }

// function getCSRFToken() {
//   for (const c of document.cookie.split(";").map(s=>s.trim())) {
//     if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
//   }
//   return null;
// }

// const SERIAL_SEP_RE = /[\r\n\t,;]+/;

// // ── Totals ─────────────────────────────────────────────────────────────────
// function calculateTotal() {
//   let amount=0, qty=0, items=0;
//   document.querySelectorAll(".item-row").forEach(row => {
//     const p = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const q = parseInt(row.querySelector(".qty-box")?.value) || 0;
//     amount += p * q;
//     qty    += q;
//     if (q > 0 || p > 0) items++;
//   });
//   document.getElementById("totalAmount").textContent     = amount.toFixed(2);
//   document.getElementById("totalQtyCount").textContent   = qty;
//   document.getElementById("totalItemsCount").textContent = items;
// }

// function updateQty(row) {
//   const filled = Array.from(row.querySelectorAll(".serials .sn"))
//     .filter(i => i.value.trim()).length;
//   row.querySelector(".qty-box").value = filled;
//   calculateTotal();
// }


// // ── Collect all serial values in form (for cross-row dupe check) ────────────
// function collectAllSNs(exceptInput = null) {
//   const map = new Map(); // UPPER → input el
//   document.querySelectorAll(".item-row .serials .sn").forEach(inp => {
//     if (inp === exceptInput) return;
//     const v = _norm(inp.value);
//     if (v) map.set(v.toUpperCase(), inp);
//   });
//   return map;
// }


// // ── Serial status validation (batch, calls backend) ──────────────────────────
// // Returns a Promise resolving to:
// //   { SERIAL_UPPER: {status:"ok"|"in_stock"|"ever_existed"|"error", label:""} }
// function checkSerialsWithBackend(serials, purchaseId = null) {
//   if (!serials.length) return Promise.resolve({});
//   return fetch("/purchase/check-serials/", {
//     method: "POST",
//     headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ serials, purchase_id: purchaseId }),
//   }).then(r => r.json()).then(data => {
//     if (!data.success) return {};
//     // key the result by uppercase serial
//     const out = {};
//     for (const [k, v] of Object.entries(data.results || {})) {
//       out[k.toUpperCase()] = v;
//     }
//     return out;
//   }).catch(() => ({}));
// }


// // ── Apply visual status tag to a serial pair ────────────────────────────────
// function applySerialStatus(snInput, tagEl, status) {
//   snInput.classList.remove("dup-self","dup-stock","dup-existed","dup-ok");
//   tagEl.textContent = "";
//   tagEl.className = "serial-status-tag";

//   switch(status) {
//     case "ok":
//       snInput.classList.add("dup-ok");
//       // no tag for clean serials — keep UI uncluttered
//       break;
//     case "dup":
//       snInput.classList.add("dup-self");
//       tagEl.textContent = "Duplicate";
//       tagEl.classList.add("tag-dup");
//       break;
//     case "in_stock":
//       snInput.classList.add("dup-stock");
//       tagEl.textContent = "In Stock!";
//       tagEl.classList.add("tag-stock");
//       break;
//     case "ever_existed":
//       snInput.classList.add("dup-existed");
//       tagEl.textContent = "Prev. System";
//       tagEl.classList.add("tag-existed");
//       break;
//     default:
//       break;
//   }
// }


// // ── Re-validate all serials in one row after any change ─────────────────────
// // This runs an instant pass for cross-row duplicates (no network),
// // then fires the backend check for stock/history status.
// function revalidateRowSerials(row) {
//   const purchaseId = document.getElementById("current_purchase_id")?.value || null;
//   const pairs      = Array.from(row.querySelectorAll(".serial-pair"));
//   if (!pairs.length) return;

//   // Step 1 — cross-row duplicates (instant, no network)
//   const formSerials = collectAllSNs();   // doesn't include this row's serials yet
//   const seenInRow   = new Map();

//   const toCheck = []; // serials to send for backend check

//   pairs.forEach(pair => {
//     const snInput = pair.querySelector(".sn");
//     const tagEl   = pair.querySelector(".serial-status-tag");
//     const v       = _norm(snInput.value);
//     if (!v) { applySerialStatus(snInput, tagEl, ""); return; }

//     const vUp = v.toUpperCase();

//     if (seenInRow.has(vUp)) {
//       // Duplicate within this row
//       applySerialStatus(snInput, tagEl, "dup");
//     } else if (formSerials.has(vUp)) {
//       // Duplicate in another row
//       applySerialStatus(snInput, tagEl, "dup");
//     } else {
//       seenInRow.set(vUp, snInput);
//       toCheck.push({ serial: v, snInput, tagEl });
//     }
//   });

//   if (!toCheck.length) return;

//   // Step 2 — backend stock/history check (async, non-blocking)
//   checkSerialsWithBackend(toCheck.map(t=>t.serial), purchaseId).then(results => {
//     toCheck.forEach(({ serial, snInput, tagEl }) => {
//       const r = results[serial.toUpperCase()];
//       if (r) applySerialStatus(snInput, tagEl, r.status);
//     });
//   });
// }


// // ── addSerialPair — add one serial+comment row inside a row ─────────────────
// function addSerialPair(row, serialValue = "", commentValue = "All Ok", autoFocus = true) {
//   const serialsDiv = row.querySelector(".serials");

//   const pair = document.createElement("div");
//   pair.className = "serial-pair";

//   const snInput  = document.createElement("input");
//   snInput.type   = "text";
//   snInput.className = "sn";
//   snInput.placeholder = "Serial number…";
//   snInput.value  = _norm(serialValue);

//   const cmtInput = document.createElement("input");
//   cmtInput.type  = "text";
//   cmtInput.className = "cmt";
//   cmtInput.placeholder = "Comment";
//   cmtInput.maxLength   = 500;
//   cmtInput.value = commentValue || "All Ok";

//   const tagEl   = document.createElement("span");
//   tagEl.className = "serial-status-tag";

//   // Enter key: SN → comment → new pair
//   snInput.addEventListener("keydown", e => {
//     if (e.key === "Enter") { e.preventDefault(); cmtInput.focus(); }
//   });
//   cmtInput.addEventListener("keydown", e => {
//     if (e.key === "Enter") { e.preventDefault(); addSerialPair(row, "", "All Ok", true); }
//   });

//   // Paste interception on SN: if multi-line, route to bulk processor
//   snInput.addEventListener("paste", e => {
//     const text = (e.clipboardData || window.clipboardData).getData("text");
//     if (text && SERIAL_SEP_RE.test(text)) {
//       e.preventDefault();
//       snInput.value = "";
//       openBulkForRow(row, text);
//     }
//   });

//   // Validate on change/input
//   snInput.addEventListener("change",  () => { updateQty(row); revalidateRowSerials(row); });
//   snInput.addEventListener("input",   () => updateQty(row));

//   pair.appendChild(snInput);
//   pair.appendChild(cmtInput);
//   pair.appendChild(tagEl);
//   serialsDiv.appendChild(pair);

//   updateQty(row);
//   if (autoFocus) snInput.focus();

//   // If already has value (loading mode) — validate immediately
//   if (serialValue.trim()) {
//     setTimeout(() => revalidateRowSerials(row), 50);
//   }
// }

// function removeSerial(row) {
//   const serialsDiv = row.querySelector(".serials");
//   const pairs = serialsDiv.querySelectorAll(".serial-pair");
//   if (pairs.length > 0) {
//     pairs[pairs.length - 1].remove();
//     updateQty(row);
//     revalidateRowSerials(row);
//     const remaining = serialsDiv.querySelectorAll(".sn");
//     if (remaining.length) remaining[remaining.length-1].focus();
//     else row.querySelector(".add-serial-btn")?.focus();
//   }
// }


// // ── Bulk paste for a specific row ────────────────────────────────────────────
// function openBulkForRow(row, prefill = "") {
//   const itemName = _norm(row.querySelector(".item_name")?.value);
//   if (!itemName) {
//     Swal.fire({ icon: "warning", title: "Select Item First",
//       text: "Please choose an item name before pasting bulk serials." });
//     return;
//   }

//   Swal.fire({
//     title: `📋 Bulk Paste — ${escapeHtml(itemName)}`,
//     html: `
//       <div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
//         Paste serial numbers (newline, tab, comma, or semicolon separated).<br>
//         Each serial gets a default comment <b>"All Ok"</b>. Duplicates &amp; stock conflicts are highlighted automatically.
//       </div>
//       <textarea id="bulkTA"
//         style="width:100%;min-height:190px;padding:12px;font-family:'DM Mono',monospace;
//                font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;
//                background:#f9fafb;color:#111827;"
//         placeholder="SN001&#10;SN002&#10;SN003&#10;…">${escapeHtml(prefill)}</textarea>
//     `,
//     showCancelButton: true,
//     confirmButtonText: "Add Serials",
//     cancelButtonText: "Cancel",
//     confirmButtonColor: "#2563eb",
//     focusConfirm: false,
//     width: "540px",
//     preConfirm: () => {
//       const ta = document.getElementById("bulkTA");
//       if (!ta || !ta.value.trim()) {
//         Swal.showValidationMessage("⚠️ Paste at least one serial number.");
//         return false;
//       }
//       return ta.value;
//     },
//     didOpen: () => { const ta = document.getElementById("bulkTA"); if (ta) ta.focus(); }
//   }).then(res => {
//     if (!res.isConfirmed || !res.value) return;
//     const raw = res.value;

//     // Parse
//     const tokens = raw.split(SERIAL_SEP_RE)
//       .map(s => s.trim()).filter(Boolean);

//     if (!tokens.length) return;

//     // Dedup within pasted text
//     const seen = new Set();
//     const unique = [];
//     const intraDups = [];
//     tokens.forEach(t => {
//       const k = t.toUpperCase();
//       if (seen.has(k)) { intraDups.push(t); }
//       else { seen.add(k); unique.push(t); }
//     });

//     // Cross-row dupe check (instant)
//     const formSNs  = collectAllSNs();
//     const accepted = [];
//     const crossDups = [];

//     unique.forEach(t => {
//       if (formSNs.has(t.toUpperCase())) { crossDups.push(t); }
//       else accepted.push(t);
//     });

//     // Add the accepted ones as serial pairs
//     accepted.forEach(sn => addSerialPair(row, sn, "All Ok", false));

//     // Trigger backend validation for the whole row
//     setTimeout(() => revalidateRowSerials(row), 100);
//     calculateTotal();

//     // Summary
//     const totalDups = intraDups.length + crossDups.length;
//     const dupDetails = [
//       ...(intraDups.length ? [`${intraDups.length} duplicate(s) within pasted text`] : []),
//       ...(crossDups.length ? [`${crossDups.length} already in another row`] : []),
//     ].join(", ");

//     Swal.fire({
//       icon: accepted.length ? "success" : "warning",
//       title: "Bulk Serial Result",
//       html: `
//         <div style="text-align:left;line-height:1.8;font-size:14px;">
//           <div>📥 Total pasted: <b>${tokens.length}</b></div>
//           <div>✅ Added: <b style="color:#16a34a;">${accepted.length}</b></div>
//           <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${totalDups}</b>
//             ${totalDups ? `<span style="font-size:12px;color:#9ca3af;"> (${dupDetails})</span>` : ""}
//           </div>
//         </div>
//         <div style="margin-top:8px;font-size:12px;color:#6b7280;">
//           ⚠️ Stock conflicts are shown inline in red/purple on the serial fields.
//         </div>
//       `,
//     });
//   });
// }


// // ── addItemRow ────────────────────────────────────────────────────────────────
// function addItemRow(shouldFocus = true) {
//   const itemsDiv = document.getElementById("items");
//   const row = document.createElement("div");
//   row.className = "item-row";

//   row.innerHTML = `
//     <div class="item_name_field autocomplete-container">
//       <input type="text" class="item_name item_search_name sale-input"
//         placeholder="Search item name…" autocomplete="off"
//         data-autocomplete-url="${autocompleteItemUrl}"
//         style="font-size:0.87rem;">
//       <div class="items_suggestions"></div>
//     </div>
//     <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00">
//     <input type="number" class="qty-box" readonly value="0">
//     <div></div>
//     <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
//     <div class="row-actions">
//       <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
//       <button type="button" class="custom-btn remove-serial">− Serial</button>
//       <button type="button" class="custom-btn btn-bulk bulk-row-btn" title="Paste bulk serials for this item">
//         <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
//       </button>
//       <button type="button" class="custom-btn remove-item">✕ Remove</button>
//     </div>
//   `;

//   row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
//   row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
//   row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
//   row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
//   row.querySelector(".unit_price").oninput     = () => calculateTotal();

//   itemsDiv.appendChild(row);
//   addSerialPair(row, "", "All Ok", false);

//   if (shouldFocus) row.querySelector(".item_name").focus();
// }


// // ── Build & Submit ────────────────────────────────────────────────────────────
// function buildAndSubmit(event) {
//   event.preventDefault();
//   const form   = event.target;
//   const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

//   const partyName = document.getElementById("search_name").value.trim();
//   let purchaseDate = document.getElementById("purchase_date").value;
//   if (!purchaseDate) purchaseDate = new Date().toISOString().slice(0,10);

//   if (!partyName) {
//     Swal.fire({ icon:"warning", title:"Missing Vendor",
//       text:"Please enter a vendor / party name." });
//     document.getElementById("search_name").focus();
//     return;
//   }

//   const items = [];
//   document.querySelectorAll(".item-row").forEach(row => {
//     const item_name  = _norm(row.querySelector(".item_name")?.value);
//     const unit_price = parseFloat(row.querySelector(".unit_price")?.value);
//     const serials    = Array.from(row.querySelectorAll(".serial-pair"))
//       .map(pair => ({
//         serial:  _norm(pair.querySelector(".sn")?.value),
//         comment: _norm(pair.querySelector(".cmt")?.value) || "All Ok",
//       }))
//       .filter(s => s.serial);

//     if (item_name && serials.length && !isNaN(unit_price) && unit_price > 0) {
//       items.push({ item_name, qty: serials.length, unit_price, serials });
//     }
//   });

//   if (items.length === 0) {
//     Swal.fire({ icon:"warning", title:"No Valid Items",
//       text:"Add at least one item with a serial number and price > 0." });
//     return;
//   }

//   const purchaseId = document.getElementById("current_purchase_id")?.value || null;
//   const payload    = { party_name: partyName, purchase_date: purchaseDate,
//                        items, action };
//   if (purchaseId) payload.purchase_id = purchaseId;

//   fetch("/purchase/purchasing/", {
//     method: "POST",
//     headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify(payload),
//   })
//   .then(r => r.json())
//   .then(data => {
//     if (data.success) {
//       Swal.fire({ icon:"success", title:"Success",
//         text: data.message || "Purchase saved!", timer:1600, showConfirmButton:false })
//       .then(() => window.location.reload());
//     } else {
//       Swal.fire({ icon:"error", title:"Error",
//         text: data.message || "Something went wrong." });
//     }
//   })
//   .catch(() => Swal.fire({ icon:"error", title:"Network Error",
//     text:"Could not reach server." }));
// }


// // ── Delete confirm ────────────────────────────────────────────────────────────
// const deleteButton = document.querySelector(".delete-btn");
// function confirmDelete(event) {
//   event.preventDefault();
//   Swal.fire({
//     title:"Delete this Purchase?", text:"This cannot be undone.", icon:"warning",
//     showCancelButton:true, confirmButtonColor:"#dc2626", cancelButtonColor:"#6b7280",
//     confirmButtonText:"Yes, delete", cancelButtonText:"Cancel",
//   }).then(r => {
//     if (r.isConfirmed) {
//       deleteButton.removeEventListener("click", confirmDelete);
//       deleteButton.click();
//       setTimeout(() => deleteButton.addEventListener("click", confirmDelete), 120);
//     }
//   });
// }
// if (deleteButton) deleteButton.addEventListener("click", confirmDelete);

// document.querySelectorAll('button[type="submit"]').forEach(btn => {
//   btn.addEventListener("click", function () {
//     document.querySelectorAll('button[type="submit"]').forEach(b=>b.removeAttribute("clicked"));
//     this.setAttribute("clicked","true");
//   });
// });


// // ── On load ──────────────────────────────────────────────────────────────────
// window.addEventListener("DOMContentLoaded", () => {
//   for (let i = 0; i < 3; i++) addItemRow(false);
//   calculateTotal();
//   document.getElementById("purchase_date").value = new Date().toISOString().slice(0,10);
// });


// // ── Party autocomplete (fuzzy, starts-with ranked first) ─────────────────────
// $(document).ready(function () {
//   const autocompleteUrl = $("#search_name").data("autocomplete-url");
//   let selectedIndex = -1;

//   $("#search_name").on("input", function () {
//     const query = $(this).val().trim();
//     const box   = $("#suggestions");
//     selectedIndex = -1;

//     if (query.length < 1) { box.hide(); return; }

//     $.ajax({ url: autocompleteUrl, data:{ term: query }, dataType:"json",
//       success(data) {
//         box.empty();
//         if (!data.length) { box.hide(); return; }
//         data.forEach(party => {
//           const highlighted = highlightMatch(party, query);
//           $("<div>").addClass("suggestion-item")
//             .html(highlighted)
//             .data("value", party)
//             .appendTo(box)
//             .on("click", function () {
//               $("#search_name").val($(this).data("value"));
//               box.hide();
//               // Focus first serial input
//               const fs = document.querySelector(".item-row .sn");
//               if (fs) fs.focus();
//             });
//         });
//         box.show();
//       }
//     });
//   });

//   $("#search_name").on("keydown", function (e) {
//     const items = $("#suggestions .suggestion-item");
//     if (!items.length) return;
//     if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
//     if (e.key === "ArrowDown") {
//       e.preventDefault(); selectedIndex = (selectedIndex+1)%items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault(); selectedIndex = (selectedIndex-1+items.length)%items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "Enter" && selectedIndex >= 0) {
//       e.preventDefault(); items.eq(selectedIndex).trigger("click");
//     }
//   });

//   $(document).on("click", e => {
//     if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
//   });
// });

// // Highlight matching substring in suggestion text
// function highlightMatch(text, query) {
//   const idx = text.toUpperCase().indexOf(query.toUpperCase());
//   if (idx < 0) return escapeHtml(text);
//   return escapeHtml(text.slice(0, idx))
//     + `<b style="color:#2563eb;">${escapeHtml(text.slice(idx, idx+query.length))}</b>`
//     + escapeHtml(text.slice(idx + query.length));
// }


// // ── Item name autocomplete (fuzzy) ────────────────────────────────────────────
// let _itemSelectedIndex = -1;

// $(document).on("input", ".item_search_name", function () {
//   const input  = $(this);
//   const query  = input.val().trim();
//   const box    = input.siblings(".items_suggestions");
//   const url    = input.data("autocomplete-url");
//   _itemSelectedIndex = -1;

//   if (query.length < 1) { box.hide(); return; }

//   $.ajax({ url, data:{ term: query }, dataType:"json",
//     success(data) {
//       box.empty();
//       if (!data.length) { box.hide(); return; }
//       data.forEach(item => {
//         const highlighted = highlightMatch(item, query);
//         $("<div>").addClass("suggestion-item")
//           .html(highlighted)
//           .data("value", item)
//           .appendTo(box)
//           .on("click", function () {
//             input.val($(this).data("value"));
//             box.hide();
//             // Focus first serial in this row
//             const row = input.closest(".item-row")[0];
//             if (row) {
//               const sn = row.querySelector(".sn");
//               if (sn) sn.focus();
//             }
//           });
//       });
//       box.show();
//     }
//   });
// });

// $(document).on("keydown", ".item_search_name", function (e) {
//   const input  = $(this);
//   const box    = input.siblings(".items_suggestions");
//   const items  = box.find(".suggestion-item");
//   if (!items.length) return;
//   if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
//   if (e.key === "ArrowDown") {
//     e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex+1)%items.length;
//     items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//   } else if (e.key === "ArrowUp") {
//     e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex-1+items.length)%items.length;
//     items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//   } else if (e.key === "Enter" && _itemSelectedIndex >= 0) {
//     e.preventDefault(); items.eq(_itemSelectedIndex).trigger("click");
//   }
// });

// $(document).on("click", e => {
//   if (!$(e.target).closest(".item_search_name, .items_suggestions").length)
//     $(".items_suggestions").hide();
// });


// // ── Navigate purchase invoices ────────────────────────────────────────────────
// async function navigatePurchase(action) {
//   try {
//     const currentId = document.getElementById("current_purchase_id").value || "";
//     const res = await fetch(
//       `/purchase/get-purchase/?action=${action}&current_id=${currentId}`,
//       { method:"GET", headers:{"X-Requested-With":"XMLHttpRequest"} }
//     );
//     let data = await res.json();
//     if (data.success === false) {
//       Swal.fire({ icon:"info", title:"Navigation", text: data.message || "Not found." });
//       return;
//     }
//     if (typeof data === "string") data = JSON.parse(data);
//     if (typeof data === "object" && !("purchase_invoice_id" in data)) {
//       try { data = JSON.parse(Object.values(data)[0]); } catch {}
//     }
//     renderPurchaseData(data);
//   } catch {
//     Swal.fire({ icon:"error", title:"Error", text:"Failed to load purchase data." });
//   }
// }

// function renderPurchaseData(data) {
//   document.getElementById("search_name").value         = data.Party || "";
//   document.getElementById("purchase_date").value       = data.invoice_date || "";
//   document.getElementById("current_purchase_id").value = data.purchase_invoice_id || "";

//   const badge = document.getElementById("invoiceIdBadge");
//   if (badge) badge.textContent = data.purchase_invoice_id ? `#${data.purchase_invoice_id}` : "#NEW";

//   const saveBtn = document.getElementById("saveBtn");
//   if (saveBtn) {
//     saveBtn.innerHTML = data.purchase_invoice_id
//       ? '<i class="fa-solid fa-pen-to-square"></i> Update Purchase'
//       : '<i class="fa-solid fa-floppy-disk"></i> Save Purchase';
//   }

//   const itemsDiv = document.getElementById("items");
//   itemsDiv.innerHTML = "";

//   if (Array.isArray(data.items)) {
//     data.items.forEach(item => {
//       const row = document.createElement("div");
//       row.className = "item-row";
//       row.innerHTML = `
//         <div class="item_name_field autocomplete-container">
//           <input type="text" class="item_name item_search_name sale-input"
//             value="${escapeHtml(item.item_name||"")}"
//             placeholder="Item name" autocomplete="off"
//             data-autocomplete-url="${autocompleteItemUrl}"
//             style="font-size:0.87rem;">
//           <div class="items_suggestions"></div>
//         </div>
//         <input type="number" class="unit_price" step="0.01" min="0"
//           placeholder="0.00" value="${item.unit_price||0}">
//         <input type="number" class="qty-box" readonly value="${item.qty||0}">
//         <div></div>
//         <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
//         <div class="row-actions">
//           <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
//           <button type="button" class="custom-btn remove-serial">− Serial</button>
//           <button type="button" class="custom-btn btn-bulk bulk-row-btn"
//             title="Paste bulk serials">
//             <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
//           </button>
//           <button type="button" class="custom-btn remove-item">✕ Remove</button>
//         </div>
//       `;

//       row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
//       row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
//       row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
//       row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
//       row.querySelector(".unit_price").oninput     = () => calculateTotal();

//       if (Array.isArray(item.serials)) {
//         item.serials.forEach(sd => {
//           let sn = "", cmt = "All Ok";
//           if (typeof sd === "string") { sn = sd; }
//           else if (sd && typeof sd === "object") {
//             sn  = sd.serial  || "";
//             cmt = sd.comment || "All Ok";
//           }
//           addSerialPair(row, sn, cmt, false);
//         });
//       }

//       itemsDiv.appendChild(row);
//       updateQty(row);
//     });
//   }

//   document.getElementById("totalAmount").textContent =
//     data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";
//   calculateTotal();

//   // Revalidate all rows after render
//   setTimeout(() => {
//     document.querySelectorAll(".item-row").forEach(r => revalidateRowSerials(r));
//   }, 80);
// }


// // ── PDF Download ──────────────────────────────────────────────────────────────
// function downloadInvoicePDF() {
//   const partyName   = document.getElementById("search_name").value.trim();
//   const purchDate   = document.getElementById("purchase_date").value;
//   const invoiceId   = document.getElementById("current_purchase_id").value;
//   const amount      = document.getElementById("totalAmount").textContent;
//   const totalQty    = document.getElementById("totalQtyCount").textContent;

//   if (!partyName) {
//     Swal.fire({ icon:"warning", title:"No Vendor",
//       text:"Fill in the vendor name before downloading." });
//     return;
//   }

//   const items = [];
//   document.querySelectorAll(".item-row").forEach((row, i) => {
//     const name  = _norm(row.querySelector(".item_name")?.value);
//     const price = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const qty   = parseInt(row.querySelector(".qty-box")?.value) || 0;
//     const serials = Array.from(row.querySelectorAll(".serial-pair"))
//       .map(p => ({
//         sn:  _norm(p.querySelector(".sn")?.value),
//         cmt: _norm(p.querySelector(".cmt")?.value) || "All Ok"
//       }))
//       .filter(s => s.sn);
//     if (name && qty > 0) items.push({ no:i+1, name, price, qty, serials, subtotal:price*qty });
//   });

//   if (!items.length) {
//     Swal.fire({ icon:"warning", title:"Nothing to Export",
//       text:"Add items with serials and price first." });
//     return;
//   }

//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
//   const W=210, PL=14, PR=196;
//   let y=0;

//   // Header band
//   doc.setFillColor(15, 40, 80);
//   doc.rect(0,0,W,44,"F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(22);
//   doc.text("PURCHASE INVOICE", PL, 18);
//   doc.setFont("helvetica","normal");
//   doc.setFontSize(10);
//   doc.text("Finance Management System", PL, 27);
//   doc.setFontSize(9);
//   doc.text(`Invoice #: ${invoiceId||"DRAFT"}`, PR, 14, {align:"right"});
//   doc.text(`Date: ${purchDate||new Date().toLocaleDateString()}`, PR, 22, {align:"right"});
//   doc.text(`Vendor: ${partyName}`, PR, 30, {align:"right"});

//   y = 54;

//   // Summary band
//   doc.setFillColor(236, 242, 255);
//   doc.rect(PL-2, y-6, W-(PL-2)*2, 12, "F");
//   doc.setTextColor(15, 40, 80);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(9);
//   doc.text(`Total Qty: ${totalQty}   ·   Total Items: ${items.length}   ·   Invoice Amount: PKR ${amount}`, PL, y+1);

//   y += 14;

//   // Table header
//   doc.setFillColor(15, 40, 80);
//   doc.rect(PL-2, y, W-(PL-2)*2, 8, "F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(8);
//   doc.text("#",          PL,     y+5.5);
//   doc.text("ITEM",       PL+10,  y+5.5);
//   doc.text("QTY",        PL+82,  y+5.5);
//   doc.text("UNIT PRICE", PL+100, y+5.5);
//   doc.text("SUBTOTAL",   PR,     y+5.5, {align:"right"});
//   y += 10;

//   // Rows
//   doc.setFont("helvetica","normal");
//   doc.setFontSize(8);
//   doc.setTextColor(20,20,20);

//   items.forEach((item, idx) => {
//     // Estimate row height: item header + serial lines (2 per line, serial + comment)
//     const snLines = Math.ceil(item.serials.length / 2);
//     const rowH = 8 + snLines * 5;

//     if (y + rowH > 270) { doc.addPage(); y = 20; }

//     if (idx % 2 === 0) {
//       doc.setFillColor(248,250,252);
//       doc.rect(PL-2, y-2, W-(PL-2)*2, rowH, "F");
//     }

//     doc.text(String(item.no), PL, y+3.5);
//     doc.setFont("helvetica","bold");
//     doc.text(item.name, PL+10, y+3.5);
//     doc.setFont("helvetica","normal");
//     doc.text(String(item.qty), PL+82, y+3.5);
//     doc.text(`PKR ${item.price.toFixed(2)}`, PL+100, y+3.5);
//     doc.text(`PKR ${item.subtotal.toFixed(2)}`, PR, y+3.5, {align:"right"});

//     // Serials: 2 per line  (SN | comment)
//     if (item.serials.length) {
//       doc.setFontSize(7);
//       doc.setTextColor(100,100,120);
//       for (let i=0; i<item.serials.length; i+=2) {
//         const a = item.serials[i];
//         const b = item.serials[i+1];
//         const lineY = y + 8 + Math.floor(i/2)*5;
//         const aText = `${a.sn}${a.cmt && a.cmt !== "All Ok" ? ` (${a.cmt})` : ""}`;
//         const bText = b ? `   ${b.sn}${b.cmt && b.cmt !== "All Ok" ? ` (${b.cmt})` : ""}` : "";
//         doc.text(aText + bText, PL+10, lineY);
//       }
//       doc.setFontSize(8);
//       doc.setTextColor(20,20,20);
//     }

//     doc.setDrawColor(229,231,235);
//     doc.setLineWidth(0.2);
//     doc.line(PL-2, y+rowH-2, PR+2, y+rowH-2);
//     y += rowH;
//   });

//   // Total band
//   y += 4;
//   if (y > 264) { doc.addPage(); y=20; }
//   doc.setFillColor(15,40,80);
//   doc.rect(PL-2, y, W-(PL-2)*2, 10, "F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(10);
//   doc.text(`TOTAL AMOUNT:  PKR ${amount}`, PR, y+7, {align:"right"});

//   // Footer
//   doc.setFontSize(7.5);
//   doc.setTextColor(150,150,150);
//   doc.setFont("helvetica","normal");
//   doc.text("Generated by Finance Management System", W/2, 290, {align:"center"});
//   doc.text(`Printed on ${new Date().toLocaleString()}`, W/2, 294, {align:"center"});

//   const fn = invoiceId
//     ? `Purchase_Invoice_${invoiceId}.pdf`
//     : `Purchase_Invoice_DRAFT_${Date.now()}.pdf`;
//   doc.save(fn);
// }


// // ── Purchase history popup ────────────────────────────────────────────────────
// async function fetchPurchaseSummary(from = null, to = null) {
//   try {
//     let url = "/purchase/get-purchase-summary/";
//     if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

//     const res  = await fetch(url);
//     const data = await res.json();

//     if (!data.success && !Array.isArray(data)) {
//       Swal.fire({ icon:"error", title:"Error", text: data.message||"Failed to fetch." });
//       return;
//     }

//     let rows = "";
//     if (Array.isArray(data) && data.length) {
//       data.forEach((p, idx) => {
//         rows += `
//           <tr class="purchase-row" data-vendor="${escapeHtml(p.vendor.toLowerCase())}"
//             onclick="viewPurchaseDetails(${p.purchase_invoice_id})" style="cursor:pointer;">
//             <td>${idx+1}</td>
//             <td><b>#${p.purchase_invoice_id}</b></td>
//             <td>${p.invoice_date}</td>
//             <td>${escapeHtml(p.vendor)}</td>
//             <td style="text-align:right;font-family:'DM Mono',monospace;">
//               PKR ${parseFloat(p.total_amount).toFixed(2)}
//             </td>
//           </tr>`;
//       });
//     } else {
//       rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
//     }

//     const html = `
//       <style>
//         .ph-search { width:100%;padding:9px 14px;margin-bottom:10px;
//           border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;
//           outline:none;font-family:inherit; }
//         .ph-search:focus { border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.1); }
//         .ph-wrap { max-height:400px;overflow-y:auto;border-radius:8px; }
//         .ph-table { width:100%;border-collapse:collapse;font-size:13px; }
//         .ph-table th { background:#f9fafb;font-weight:700;color:#374151;
//           padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left; }
//         .ph-table td { padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151; }
//         .ph-table .purchase-row:hover td { background:#eff6ff;color:#1d4ed8; }
//       </style>
//       <input type="text" class="ph-search" placeholder="🔍 Search by vendor…"
//         onkeyup="filterPurchaseTable(this.value)">
//       <div class="ph-wrap">
//         <table class="ph-table">
//           <thead>
//             <tr><th>#</th><th>Invoice</th><th>Date</th><th>Vendor</th><th>Amount</th></tr>
//           </thead>
//           <tbody id="purchaseSummaryBody">${rows}</tbody>
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
//         if (el.dataset.pt !== undefined) { el.setAttribute("tabindex",el.dataset.pt); delete el.dataset.pt; }
//         else el.removeAttribute("tabindex");
//       });
//     }

//     disableBg();
//     Swal.fire({
//       title:"📜 Purchase History", html, width:"720px",
//       confirmButtonText:"Close", confirmButtonColor:"#2563eb",
//       focusConfirm:false, allowOutsideClick:false, allowEscapeKey:true,
//       didOpen: popup => {
//         document.querySelectorAll("input,textarea,select").forEach(el => el.blur());
//         popup.addEventListener("focusin",  e => e.stopPropagation());
//         popup.addEventListener("keydown",  e => e.stopPropagation());
//         setTimeout(() => {
//           const inp = popup.querySelector(".ph-search");
//           if (inp) { inp.focus(); inp.select(); }
//         }, 80);
//       },
//       willClose: enableBg,
//     });
//   } catch (err) {
//     Swal.fire({ icon:"error", title:"Network Error", text: err.message||"Cannot fetch." });
//   }
// }

// function filterPurchaseTable(query) {
//   query = query.toLowerCase().trim();
//   document.querySelectorAll("#purchaseSummaryBody .purchase-row").forEach(row => {
//     row.style.display = row.dataset.vendor.includes(query) ? "" : "none";
//   });
// }

// function purchaseHistory()  { fetchPurchaseSummary(); }
// function purchaseDateWise() {
//   const today = new Date().toISOString().split("T")[0];
//   Swal.fire({
//     title:"📅 Select Date Range",
//     html:`
//       <div style="text-align:left;margin:8px 0;">
//         <label style="font-size:13px;color:#6b7280;">From Date</label>
//         <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:4px 0 12px;">
//         <label style="font-size:13px;color:#6b7280;">To Date</label>
//         <input type="date" id="toDate" class="swal2-input"
//           style="width:100%;margin:4px 0;" value="${today}">
//       </div>
//     `,
//     focusConfirm:false, showCancelButton:true,
//     confirmButtonText:"Fetch Purchases", confirmButtonColor:"#2563eb",
//     preConfirm:() => {
//       const f = document.getElementById("fromDate").value;
//       const t = document.getElementById("toDate").value;
//       if (!f||!t) { Swal.showValidationMessage("⚠️ Both dates required"); return false; }
//       return { fromDate:f, toDate:t };
//     },
//   }).then(r => { if (r.isConfirmed) fetchPurchaseSummary(r.value.fromDate, r.value.toDate); });
// }

// function viewPurchaseDetails(purchaseId) {
//   document.getElementById("current_purchase_id").value = purchaseId;
//   navigatePurchase("current");
//   Swal.close();
// }



/* ============================================================
   PURCHASE PAGE — COMPLETE SCRIPT
   Features:
     - Fuzzy item autocomplete (substring match, starts-with ranked first)
     - Bulk serial paste per row (item must be selected first)
     - Serial comments default to "All Ok"
     - Instant duplicate detection: within-invoice AND stock history
     - Total Items / Total Qty / Total Amount
     - PDF download (PKR currency)
     - Previous / Next / Current navigation
     - Purchase history summary popup
   ============================================================ */

// // ── Utilities ──────────────────────────────────────────────────────────────
// function _norm(s) { return (s == null ? "" : String(s)).trim(); }

// function escapeHtml(s) {
//   return String(s == null ? "" : s)
//     .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
//     .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
// }

// function getCSRFToken() {
//   for (const c of document.cookie.split(";").map(s=>s.trim())) {
//     if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
//   }
//   return null;
// }

// const SERIAL_SEP_RE = /[\r\n\t,;]+/;

// // ── Totals ─────────────────────────────────────────────────────────────────
// function calculateTotal() {
//   let amount=0, qty=0, items=0;
//   document.querySelectorAll(".item-row").forEach(row => {
//     const p = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const q = parseInt(row.querySelector(".qty-box")?.value) || 0;
//     amount += p * q;
//     qty    += q;
//     if (q > 0 || p > 0) items++;
//   });
//   document.getElementById("totalAmount").textContent     = amount.toFixed(2);
//   document.getElementById("totalQtyCount").textContent   = qty;
//   document.getElementById("totalItemsCount").textContent = items;
// }

// function updateQty(row) {
//   const filled = Array.from(row.querySelectorAll(".serials .sn"))
//     .filter(i => i.value.trim()).length;
//   row.querySelector(".qty-box").value = filled;
//   calculateTotal();
// }


// // ── Collect all serial values in form (for cross-row dupe check) ────────────
// function collectAllSNs(exceptInput = null) {
//   const map = new Map(); // UPPER → input el
//   document.querySelectorAll(".item-row .serials .sn").forEach(inp => {
//     if (inp === exceptInput) return;
//     const v = _norm(inp.value);
//     if (v) map.set(v.toUpperCase(), inp);
//   });
//   return map;
// }


// // ── Serial status validation (batch, calls backend) ──────────────────────────
// // Returns a Promise resolving to:
// //   { SERIAL_UPPER: {status:"ok"|"in_stock"|"ever_existed"|"error", label:""} }
// function checkSerialsWithBackend(serials, purchaseId = null) {
//   if (!serials.length) return Promise.resolve({});
//   return fetch("/purchase/check-serials/", {
//     method: "POST",
//     headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify({ serials, purchase_id: purchaseId }),
//   }).then(r => r.json()).then(data => {
//     if (!data.success) return {};
//     // key the result by uppercase serial
//     const out = {};
//     for (const [k, v] of Object.entries(data.results || {})) {
//       out[k.toUpperCase()] = v;
//     }
//     return out;
//   }).catch(() => ({}));
// }


// // ── Apply visual status tag to a serial pair ────────────────────────────────
// function applySerialStatus(snInput, tagEl, status) {
//   snInput.classList.remove("dup-self","dup-stock","dup-existed","dup-ok");
//   tagEl.textContent = "";
//   tagEl.className = "serial-status-tag";

//   switch(status) {
//     case "ok":
//       snInput.classList.add("dup-ok");
//       // no tag for clean serials — keep UI uncluttered
//       break;
//     case "dup":
//       snInput.classList.add("dup-self");
//       tagEl.textContent = "Duplicate";
//       tagEl.classList.add("tag-dup");
//       break;
//     case "in_stock":
//       snInput.classList.add("dup-stock");
//       tagEl.textContent = "In Stock!";
//       tagEl.classList.add("tag-stock");
//       break;
//     case "ever_existed":
//       snInput.classList.add("dup-existed");
//       tagEl.textContent = "Prev. System";
//       tagEl.classList.add("tag-existed");
//       break;
//     default:
//       break;
//   }
// }


// // ── Re-validate all serials in one row after any change ─────────────────────
// // This runs an instant pass for cross-row duplicates (no network),
// // then fires the backend check for stock/history status.
// function revalidateRowSerials(row) {
//   const purchaseId = document.getElementById("current_purchase_id")?.value || null;
//   const pairs      = Array.from(row.querySelectorAll(".serial-pair"));
//   if (!pairs.length) return;

//   // Step 1 — cross-row duplicates (instant, no network)
//   // Exclude ALL inputs belonging to this row so they don't falsely match each other
//   const rowSNs = new Set(Array.from(row.querySelectorAll(".sn")).map(i => i.value.trim().toUpperCase()).filter(Boolean));
//   const formSerials = new Map([...collectAllSNs()].filter(([k]) => !rowSNs.has(k)));
//   const seenInRow   = new Map();

//   const toCheck = []; // serials to send for backend check

//   pairs.forEach(pair => {
//     const snInput = pair.querySelector(".sn");
//     const tagEl   = pair.querySelector(".serial-status-tag");
//     const v       = _norm(snInput.value);
//     if (!v) { applySerialStatus(snInput, tagEl, ""); return; }

//     const vUp = v.toUpperCase();

//     if (seenInRow.has(vUp)) {
//       // Duplicate within this row
//       applySerialStatus(snInput, tagEl, "dup");
//     } else if (formSerials.has(vUp)) {
//       // Duplicate in another row
//       applySerialStatus(snInput, tagEl, "dup");
//     } else {
//       seenInRow.set(vUp, snInput);
//       toCheck.push({ serial: v, snInput, tagEl });
//     }
//   });

//   if (!toCheck.length) return;

//   // Step 2 — backend stock/history check (async, non-blocking)
//   checkSerialsWithBackend(toCheck.map(t=>t.serial), purchaseId).then(results => {
//     toCheck.forEach(({ serial, snInput, tagEl }) => {
//       const r = results[serial.toUpperCase()];
//       if (r) applySerialStatus(snInput, tagEl, r.status);
//     });
//   });
// }


// // ── addSerialPair — add one serial+comment row inside a row ─────────────────
// function addSerialPair(row, serialValue = "", commentValue = "All Ok", autoFocus = true) {
//   const serialsDiv = row.querySelector(".serials");

//   const pair = document.createElement("div");
//   pair.className = "serial-pair";

//   const snInput  = document.createElement("input");
//   snInput.type   = "text";
//   snInput.className = "sn";
//   snInput.placeholder = "Serial number…";
//   snInput.value  = _norm(serialValue);

//   const cmtInput = document.createElement("input");
//   cmtInput.type  = "text";
//   cmtInput.className = "cmt";
//   cmtInput.placeholder = "Comment";
//   cmtInput.maxLength   = 500;
//   cmtInput.value = commentValue || "All Ok";

//   const tagEl   = document.createElement("span");
//   tagEl.className = "serial-status-tag";

//   // Enter key: SN → comment → new pair
//   snInput.addEventListener("keydown", e => {
//     if (e.key === "Enter") { e.preventDefault(); cmtInput.focus(); }
//   });
//   cmtInput.addEventListener("keydown", e => {
//     if (e.key === "Enter") { e.preventDefault(); addSerialPair(row, "", "All Ok", true); }
//   });

//   // Paste interception on SN: if multi-line, route to bulk processor
//   snInput.addEventListener("paste", e => {
//     const text = (e.clipboardData || window.clipboardData).getData("text");
//     if (text && SERIAL_SEP_RE.test(text)) {
//       e.preventDefault();
//       snInput.value = "";
//       openBulkForRow(row, text);
//     }
//   });

//   // Validate on change/input
//   snInput.addEventListener("change",  () => { updateQty(row); revalidateRowSerials(row); });
//   snInput.addEventListener("input",   () => updateQty(row));

//   pair.appendChild(snInput);
//   pair.appendChild(cmtInput);
//   pair.appendChild(tagEl);
//   serialsDiv.appendChild(pair);

//   updateQty(row);
//   if (autoFocus) snInput.focus();

//   // If already has value (loading mode) — validate immediately
//   if (serialValue.trim()) {
//     setTimeout(() => revalidateRowSerials(row), 50);
//   }
// }

// function removeSerial(row) {
//   const serialsDiv = row.querySelector(".serials");
//   const pairs = serialsDiv.querySelectorAll(".serial-pair");
//   if (pairs.length > 0) {
//     pairs[pairs.length - 1].remove();
//     updateQty(row);
//     revalidateRowSerials(row);
//     const remaining = serialsDiv.querySelectorAll(".sn");
//     if (remaining.length) remaining[remaining.length-1].focus();
//     else row.querySelector(".add-serial-btn")?.focus();
//   }
// }


// // ── Bulk paste for a specific row ────────────────────────────────────────────
// function openBulkForRow(row, prefill = "") {
//   const itemName = _norm(row.querySelector(".item_name")?.value);
//   if (!itemName) {
//     Swal.fire({ icon: "warning", title: "Select Item First",
//       text: "Please choose an item name before pasting bulk serials." });
//     return;
//   }

//   Swal.fire({
//     title: `📋 Bulk Paste — ${escapeHtml(itemName)}`,
//     html: `
//       <div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
//         Paste serial numbers (newline, tab, comma, or semicolon separated).<br>
//         Each serial gets a default comment <b>"All Ok"</b>. Duplicates &amp; stock conflicts are highlighted automatically.
//       </div>
//       <textarea id="bulkTA"
//         style="width:100%;min-height:190px;padding:12px;font-family:'DM Mono',monospace;
//                font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;
//                background:#f9fafb;color:#111827;"
//         placeholder="SN001&#10;SN002&#10;SN003&#10;…">${escapeHtml(prefill)}</textarea>
//     `,
//     showCancelButton: true,
//     confirmButtonText: "Add Serials",
//     cancelButtonText: "Cancel",
//     confirmButtonColor: "#2563eb",
//     focusConfirm: false,
//     width: "540px",
//     preConfirm: () => {
//       const ta = document.getElementById("bulkTA");
//       if (!ta || !ta.value.trim()) {
//         Swal.showValidationMessage("⚠️ Paste at least one serial number.");
//         return false;
//       }
//       return ta.value;
//     },
//     didOpen: () => { const ta = document.getElementById("bulkTA"); if (ta) ta.focus(); }
//   }).then(res => {
//     if (!res.isConfirmed || !res.value) return;
//     const raw = res.value;

//     // Parse
//     const tokens = raw.split(SERIAL_SEP_RE)
//       .map(s => s.trim()).filter(Boolean);

//     if (!tokens.length) return;

//     // Dedup within pasted text
//     const seen = new Set();
//     const unique = [];
//     const intraDups = [];
//     tokens.forEach(t => {
//       const k = t.toUpperCase();
//       if (seen.has(k)) { intraDups.push(t); }
//       else { seen.add(k); unique.push(t); }
//     });

//     // Cross-row dupe check (instant)
//     const formSNs  = collectAllSNs();
//     const accepted = [];
//     const crossDups = [];

//     unique.forEach(t => {
//       if (formSNs.has(t.toUpperCase())) { crossDups.push(t); }
//       else accepted.push(t);
//     });

//     // Add the accepted ones as serial pairs
//     accepted.forEach(sn => addSerialPair(row, sn, "All Ok", false));

//     // Trigger backend validation for the whole row
//     setTimeout(() => revalidateRowSerials(row), 100);
//     calculateTotal();

//     // Summary
//     const totalDups = intraDups.length + crossDups.length;
//     const dupDetails = [
//       ...(intraDups.length ? [`${intraDups.length} duplicate(s) within pasted text`] : []),
//       ...(crossDups.length ? [`${crossDups.length} already in another row`] : []),
//     ].join(", ");

//     Swal.fire({
//       icon: accepted.length ? "success" : "warning",
//       title: "Bulk Serial Result",
//       html: `
//         <div style="text-align:left;line-height:1.8;font-size:14px;">
//           <div>📥 Total pasted: <b>${tokens.length}</b></div>
//           <div>✅ Added: <b style="color:#16a34a;">${accepted.length}</b></div>
//           <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${totalDups}</b>
//             ${totalDups ? `<span style="font-size:12px;color:#9ca3af;"> (${dupDetails})</span>` : ""}
//           </div>
//         </div>
//         <div style="margin-top:8px;font-size:12px;color:#6b7280;">
//           ⚠️ Stock conflicts are shown inline in red/purple on the serial fields.
//         </div>
//       `,
//     });
//   });
// }


// // ── addItemRow ────────────────────────────────────────────────────────────────
// function addItemRow(shouldFocus = true) {
//   const itemsDiv = document.getElementById("items");
//   const row = document.createElement("div");
//   row.className = "item-row purchase-row";

//   row.innerHTML = `
//     <div class="item_name_field autocomplete-container">
//       <input type="text" class="item_name item_search_name sale-input"
//         placeholder="Search item name…" autocomplete="off"
//         data-autocomplete-url="${autocompleteItemUrl}"
//         style="font-size:0.87rem;">
//       <div class="items_suggestions"></div>
//     </div>
//     <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00">
//     <input type="number" class="qty-box" readonly value="0">
//     <div></div>
//     <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
//     <div class="row-actions">
//       <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
//       <button type="button" class="custom-btn remove-serial">− Serial</button>
//       <button type="button" class="custom-btn btn-bulk bulk-row-btn" title="Paste bulk serials for this item">
//         <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
//       </button>
//       <button type="button" class="custom-btn remove-item">✕ Remove</button>
//     </div>
//   `;

//   row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
//   row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
//   row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
//   row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
//   row.querySelector(".unit_price").oninput     = () => calculateTotal();

//   itemsDiv.appendChild(row);
//   addSerialPair(row, "", "All Ok", false);

//   if (shouldFocus) row.querySelector(".item_name").focus();
// }


// // ── Build & Submit ────────────────────────────────────────────────────────────
// function buildAndSubmit(event) {
//   event.preventDefault();
//   const form   = event.target;
//   const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

//   const partyName = document.getElementById("search_name").value.trim();
//   let purchaseDate = document.getElementById("purchase_date").value;
//   if (!purchaseDate) purchaseDate = new Date().toISOString().slice(0,10);

//   if (!partyName) {
//     Swal.fire({ icon:"warning", title:"Missing Vendor",
//       text:"Please enter a vendor / party name." });
//     document.getElementById("search_name").focus();
//     return;
//   }

//   const items = [];
//   document.querySelectorAll(".item-row").forEach(row => {
//     const item_name  = _norm(row.querySelector(".item_name")?.value);
//     const unit_price = parseFloat(row.querySelector(".unit_price")?.value);
//     const serials    = Array.from(row.querySelectorAll(".serial-pair"))
//       .map(pair => ({
//         serial:  _norm(pair.querySelector(".sn")?.value),
//         comment: _norm(pair.querySelector(".cmt")?.value) || "All Ok",
//       }))
//       .filter(s => s.serial);

//     if (item_name && serials.length && !isNaN(unit_price) && unit_price > 0) {
//       items.push({ item_name, qty: serials.length, unit_price, serials });
//     }
//   });

//   if (items.length === 0) {
//     Swal.fire({ icon:"warning", title:"No Valid Items",
//       text:"Add at least one item with a serial number and price > 0." });
//     return;
//   }

//   const purchaseId = document.getElementById("current_purchase_id")?.value || null;
//   const payload    = { party_name: partyName, purchase_date: purchaseDate,
//                        items, action };
//   if (purchaseId) payload.purchase_id = purchaseId;

//   fetch("/purchase/purchasing/", {
//     method: "POST",
//     headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
//     body: JSON.stringify(payload),
//   })
//   .then(r => r.json())
//   .then(data => {
//     if (data.success) {
//       Swal.fire({ icon:"success", title:"Success",
//         text: data.message || "Purchase saved!", timer:1600, showConfirmButton:false })
//       .then(() => window.location.reload());
//     } else {
//       Swal.fire({ icon:"error", title:"Error",
//         text: data.message || "Something went wrong." });
//     }
//   })
//   .catch(() => Swal.fire({ icon:"error", title:"Network Error",
//     text:"Could not reach server." }));
// }


// // ── Delete confirm ────────────────────────────────────────────────────────────
// const deleteButton = document.querySelector(".delete-btn");
// function confirmDelete(event) {
//   event.preventDefault();
//   Swal.fire({
//     title:"Delete this Purchase?", text:"This cannot be undone.", icon:"warning",
//     showCancelButton:true, confirmButtonColor:"#dc2626", cancelButtonColor:"#6b7280",
//     confirmButtonText:"Yes, delete", cancelButtonText:"Cancel",
//   }).then(r => {
//     if (r.isConfirmed) {
//       deleteButton.removeEventListener("click", confirmDelete);
//       deleteButton.click();
//       setTimeout(() => deleteButton.addEventListener("click", confirmDelete), 120);
//     }
//   });
// }
// if (deleteButton) deleteButton.addEventListener("click", confirmDelete);

// document.querySelectorAll('button[type="submit"]').forEach(btn => {
//   btn.addEventListener("click", function () {
//     document.querySelectorAll('button[type="submit"]').forEach(b=>b.removeAttribute("clicked"));
//     this.setAttribute("clicked","true");
//   });
// });


// // ── On load ──────────────────────────────────────────────────────────────────
// window.addEventListener("DOMContentLoaded", () => {
//   for (let i = 0; i < 3; i++) addItemRow(false);
//   calculateTotal();
//   document.getElementById("purchase_date").value = new Date().toISOString().slice(0,10);
// });


// // ── Party autocomplete (fuzzy, starts-with ranked first) ─────────────────────
// $(document).ready(function () {
//   const autocompleteUrl = $("#search_name").data("autocomplete-url");
//   let selectedIndex = -1;

//   $("#search_name").on("input", function () {
//     const query = $(this).val().trim();
//     const box   = $("#suggestions");
//     selectedIndex = -1;

//     if (query.length < 1) { box.hide(); return; }

//     $.ajax({ url: autocompleteUrl, data:{ term: query }, dataType:"json",
//       success(data) {
//         box.empty();
//         if (!data.length) { box.hide(); return; }
//         data.forEach(party => {
//           const highlighted = highlightMatch(party, query);
//           $("<div>").addClass("suggestion-item")
//             .html(highlighted)
//             .data("value", party)
//             .appendTo(box)
//             .on("click", function () {
//               $("#search_name").val($(this).data("value"));
//               box.hide();
//               // Focus first serial input
//               const fs = document.querySelector(".item-row .sn");
//               if (fs) fs.focus();
//             });
//         });
//         box.show();
//       }
//     });
//   });

//   $("#search_name").on("keydown", function (e) {
//     const items = $("#suggestions .suggestion-item");
//     if (!items.length) return;
//     if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
//     if (e.key === "ArrowDown") {
//       e.preventDefault(); selectedIndex = (selectedIndex+1)%items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault(); selectedIndex = (selectedIndex-1+items.length)%items.length;
//       items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//     } else if (e.key === "Enter" && selectedIndex >= 0) {
//       e.preventDefault(); items.eq(selectedIndex).trigger("click");
//     }
//   });

//   $(document).on("click", e => {
//     if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
//   });
// });

// // Highlight matching substring in suggestion text
// function highlightMatch(text, query) {
//   const idx = text.toUpperCase().indexOf(query.toUpperCase());
//   if (idx < 0) return escapeHtml(text);
//   return escapeHtml(text.slice(0, idx))
//     + `<b style="color:#2563eb;">${escapeHtml(text.slice(idx, idx+query.length))}</b>`
//     + escapeHtml(text.slice(idx + query.length));
// }


// // ── Item name autocomplete (fuzzy) ────────────────────────────────────────────
// let _itemSelectedIndex = -1;

// $(document).on("input", ".item_search_name", function () {
//   const input  = $(this);
//   const query  = input.val().trim();
//   const box    = input.siblings(".items_suggestions");
//   const url    = input.data("autocomplete-url");
//   _itemSelectedIndex = -1;

//   if (query.length < 1) { box.hide(); return; }

//   $.ajax({ url, data:{ term: query }, dataType:"json",
//     success(data) {
//       box.empty();
//       if (!data.length) { box.hide(); return; }
//       data.forEach(item => {
//         const highlighted = highlightMatch(item, query);
//         $("<div>").addClass("suggestion-item")
//           .html(highlighted)
//           .data("value", item)
//           .appendTo(box)
//           .on("click", function () {
//             input.val($(this).data("value"));
//             box.hide();
//             // Focus first serial in this row
//             const row = input.closest(".item-row")[0];
//             if (row) {
//               const sn = row.querySelector(".sn");
//               if (sn) sn.focus();
//             }
//           });
//       });
//       box.show();
//     }
//   });
// });

// $(document).on("keydown", ".item_search_name", function (e) {
//   const input  = $(this);
//   const box    = input.siblings(".items_suggestions");
//   const items  = box.find(".suggestion-item");
//   if (!items.length) return;
//   if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
//   if (e.key === "ArrowDown") {
//     e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex+1)%items.length;
//     items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//   } else if (e.key === "ArrowUp") {
//     e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex-1+items.length)%items.length;
//     items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
//   } else if (e.key === "Enter" && _itemSelectedIndex >= 0) {
//     e.preventDefault(); items.eq(_itemSelectedIndex).trigger("click");
//   }
// });

// $(document).on("click", e => {
//   if (!$(e.target).closest(".item_search_name, .items_suggestions").length)
//     $(".items_suggestions").hide();
// });


// // ── Navigate purchase invoices ────────────────────────────────────────────────
// async function navigatePurchase(action) {
//   try {
//     const currentId = document.getElementById("current_purchase_id").value || "";
//     const res = await fetch(
//       `/purchase/get-purchase/?action=${action}&current_id=${currentId}`,
//       { method:"GET", headers:{"X-Requested-With":"XMLHttpRequest"} }
//     );
//     let data = await res.json();
//     if (data.success === false) {
//       Swal.fire({ icon:"info", title:"Navigation", text: data.message || "Not found." });
//       return;
//     }
//     if (typeof data === "string") data = JSON.parse(data);
//     if (typeof data === "object" && !("purchase_invoice_id" in data)) {
//       try { data = JSON.parse(Object.values(data)[0]); } catch {}
//     }
//     renderPurchaseData(data);
//   } catch {
//     Swal.fire({ icon:"error", title:"Error", text:"Failed to load purchase data." });
//   }
// }

// function renderPurchaseData(data) {
//   document.getElementById("search_name").value         = data.Party || "";
//   document.getElementById("purchase_date").value       = data.invoice_date || "";
//   document.getElementById("current_purchase_id").value = data.purchase_invoice_id || "";

//   const badge = document.getElementById("invoiceIdBadge");
//   if (badge) badge.textContent = data.purchase_invoice_id ? `#${data.purchase_invoice_id}` : "#NEW";

//   const saveBtn = document.getElementById("saveBtn");
//   if (saveBtn) {
//     saveBtn.innerHTML = data.purchase_invoice_id
//       ? '<i class="fa-solid fa-pen-to-square"></i> Update Purchase'
//       : '<i class="fa-solid fa-floppy-disk"></i> Save Purchase';
//   }

//   const itemsDiv = document.getElementById("items");
//   itemsDiv.innerHTML = "";

//   if (Array.isArray(data.items)) {
//     data.items.forEach(item => {
//       const row = document.createElement("div");
//       row.className = "item-row purchase-row";
//       row.innerHTML = `
//         <div class="item_name_field autocomplete-container">
//           <input type="text" class="item_name item_search_name sale-input"
//             value="${escapeHtml(item.item_name||"")}"
//             placeholder="Item name" autocomplete="off"
//             data-autocomplete-url="${autocompleteItemUrl}"
//             style="font-size:0.87rem;">
//           <div class="items_suggestions"></div>
//         </div>
//         <input type="number" class="unit_price" step="0.01" min="0"
//           placeholder="0.00" value="${item.unit_price||0}">
//         <input type="number" class="qty-box" readonly value="${item.qty||0}">
//         <div></div>
//         <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
//         <div class="row-actions">
//           <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
//           <button type="button" class="custom-btn remove-serial">− Serial</button>
//           <button type="button" class="custom-btn btn-bulk bulk-row-btn"
//             title="Paste bulk serials">
//             <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
//           </button>
//           <button type="button" class="custom-btn remove-item">✕ Remove</button>
//         </div>
//       `;

//       row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
//       row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
//       row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
//       row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
//       row.querySelector(".unit_price").oninput     = () => calculateTotal();

//       if (Array.isArray(item.serials)) {
//         item.serials.forEach(sd => {
//           let sn = "", cmt = "All Ok";
//           if (typeof sd === "string") { sn = sd; }
//           else if (sd && typeof sd === "object") {
//             sn  = sd.serial  || "";
//             cmt = sd.comment || "All Ok";
//           }
//           addSerialPair(row, sn, cmt, false);
//         });
//       }

//       itemsDiv.appendChild(row);
//       updateQty(row);
//     });
//   }

//   document.getElementById("totalAmount").textContent =
//     data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";
//   calculateTotal();

//   // Revalidate all rows after render
//   setTimeout(() => {
//     document.querySelectorAll(".item-row").forEach(r => revalidateRowSerials(r));
//   }, 80);
// }


// // ── PDF Download ──────────────────────────────────────────────────────────────
// function downloadInvoicePDF() {
//   const partyName   = document.getElementById("search_name").value.trim();
//   const purchDate   = document.getElementById("purchase_date").value;
//   const invoiceId   = document.getElementById("current_purchase_id").value;
//   const amount      = document.getElementById("totalAmount").textContent;
//   const totalQty    = document.getElementById("totalQtyCount").textContent;

//   if (!partyName) {
//     Swal.fire({ icon:"warning", title:"No Vendor",
//       text:"Fill in the vendor name before downloading." });
//     return;
//   }

//   const items = [];
//   document.querySelectorAll(".item-row").forEach((row, i) => {
//     const name  = _norm(row.querySelector(".item_name")?.value);
//     const price = parseFloat(row.querySelector(".unit_price")?.value) || 0;
//     const qty   = parseInt(row.querySelector(".qty-box")?.value) || 0;
//     const serials = Array.from(row.querySelectorAll(".serial-pair"))
//       .map(p => ({
//         sn:  _norm(p.querySelector(".sn")?.value),
//         cmt: _norm(p.querySelector(".cmt")?.value) || "All Ok"
//       }))
//       .filter(s => s.sn);
//     if (name && qty > 0) items.push({ no:i+1, name, price, qty, serials, subtotal:price*qty });
//   });

//   if (!items.length) {
//     Swal.fire({ icon:"warning", title:"Nothing to Export",
//       text:"Add items with serials and price first." });
//     return;
//   }

//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
//   const W=210, PL=14, PR=196;
//   let y=0;

//   // Header band
//   doc.setFillColor(15, 40, 80);
//   doc.rect(0,0,W,44,"F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(22);
//   doc.text("PURCHASE INVOICE", PL, 18);
//   doc.setFont("helvetica","normal");
//   doc.setFontSize(10);
//   doc.text("Financee Accounting System", PL, 27);
//   doc.setFontSize(9);
//   doc.text(`Invoice #: ${invoiceId||"DRAFT"}`, PR, 14, {align:"right"});
//   doc.text(`Date: ${purchDate||new Date().toLocaleDateString()}`, PR, 22, {align:"right"});
//   doc.text(`Vendor: ${partyName}`, PR, 30, {align:"right"});

//   y = 54;

//   // Summary band
//   doc.setFillColor(236, 242, 255);
//   doc.rect(PL-2, y-6, W-(PL-2)*2, 12, "F");
//   doc.setTextColor(15, 40, 80);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(9);
//   doc.text(`Total Qty: ${totalQty}   ·   Total Items: ${items.length}   ·   Invoice Amount: PKR ${amount}`, PL, y+1);

//   y += 14;

//   // Table header
//   doc.setFillColor(15, 40, 80);
//   doc.rect(PL-2, y, W-(PL-2)*2, 8, "F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(8);
//   doc.text("#",          PL,     y+5.5);
//   doc.text("ITEM",       PL+10,  y+5.5);
//   doc.text("QTY",        PL+82,  y+5.5);
//   doc.text("UNIT PRICE", PL+100, y+5.5);
//   doc.text("SUBTOTAL",   PR,     y+5.5, {align:"right"});
//   y += 10;

//   // Rows
//   doc.setFont("helvetica","normal");
//   doc.setFontSize(8);
//   doc.setTextColor(20,20,20);

//   items.forEach((item, idx) => {
//     // Estimate row height: item header + serial lines (2 per line, serial + comment)
//     const snLines = Math.ceil(item.serials.length / 2);
//     const rowH = 8 + snLines * 5;

//     if (y + rowH > 270) { doc.addPage(); y = 20; }

//     if (idx % 2 === 0) {
//       doc.setFillColor(248,250,252);
//       doc.rect(PL-2, y-2, W-(PL-2)*2, rowH, "F");
//     }

//     doc.text(String(item.no), PL, y+3.5);
//     doc.setFont("helvetica","bold");
//     doc.text(item.name, PL+10, y+3.5);
//     doc.setFont("helvetica","normal");
//     doc.text(String(item.qty), PL+82, y+3.5);
//     doc.text(`PKR ${item.price.toFixed(2)}`, PL+100, y+3.5);
//     doc.text(`PKR ${item.subtotal.toFixed(2)}`, PR, y+3.5, {align:"right"});

//     // Serials: 2 per line  (SN | comment)
//     if (item.serials.length) {
//       doc.setFontSize(7);
//       doc.setTextColor(100,100,120);
//       for (let i=0; i<item.serials.length; i+=2) {
//         const a = item.serials[i];
//         const b = item.serials[i+1];
//         const lineY = y + 8 + Math.floor(i/2)*5;
//         const aText = `${a.sn}${a.cmt && a.cmt !== "All Ok" ? ` (${a.cmt})` : ""}`;
//         const bText = b ? `   ${b.sn}${b.cmt && b.cmt !== "All Ok" ? ` (${b.cmt})` : ""}` : "";
//         doc.text(aText + bText, PL+10, lineY);
//       }
//       doc.setFontSize(8);
//       doc.setTextColor(20,20,20);
//     }

//     doc.setDrawColor(229,231,235);
//     doc.setLineWidth(0.2);
//     doc.line(PL-2, y+rowH-2, PR+2, y+rowH-2);
//     y += rowH;
//   });

//   // Total band
//   y += 4;
//   if (y > 264) { doc.addPage(); y=20; }
//   doc.setFillColor(15,40,80);
//   doc.rect(PL-2, y, W-(PL-2)*2, 10, "F");
//   doc.setTextColor(255,255,255);
//   doc.setFont("helvetica","bold");
//   doc.setFontSize(10);
//   doc.text(`TOTAL AMOUNT:  PKR ${amount}`, PR, y+7, {align:"right"});

//   // Footer
//   doc.setFontSize(7.5);
//   doc.setTextColor(150,150,150);
//   doc.setFont("helvetica","normal");
//   doc.text("Generated by Financee Developed by Maaz Rehan", W/2, 290, {align:"center"});
//   doc.text(`Printed on ${new Date().toLocaleString()}`, W/2, 294, {align:"center"});

//   const fn = invoiceId
//     ? `Purchase_Invoice_${invoiceId}.pdf`
//     : `Purchase_Invoice_DRAFT_${Date.now()}.pdf`;
//   doc.save(fn);
// }


// // ── Purchase history popup ────────────────────────────────────────────────────
// async function fetchPurchaseSummary(from = null, to = null) {
//   try {
//     let url = "/purchase/get-purchase-summary/";
//     if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

//     const res  = await fetch(url);
//     const data = await res.json();

//     if (!data.success && !Array.isArray(data)) {
//       Swal.fire({ icon:"error", title:"Error", text: data.message||"Failed to fetch." });
//       return;
//     }

//     let rows = "";
//     if (Array.isArray(data) && data.length) {
//       data.forEach((p, idx) => {
//         rows += `
//           <tr class="purchase-row" data-vendor="${escapeHtml(p.vendor.toLowerCase())}"
//             onclick="viewPurchaseDetails(${p.purchase_invoice_id})" style="cursor:pointer;">
//             <td>${idx+1}</td>
//             <td><b>#${p.purchase_invoice_id}</b></td>
//             <td>${p.invoice_date}</td>
//             <td>${escapeHtml(p.vendor)}</td>
//             <td style="text-align:right;font-family:'DM Mono',monospace;">
//               PKR ${parseFloat(p.total_amount).toFixed(2)}
//             </td>
//           </tr>`;
//       });
//     } else {
//       rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
//     }

//     const html = `
//       <style>
//         .ph-search { width:100%;padding:9px 14px;margin-bottom:10px;
//           border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;
//           outline:none;font-family:inherit; }
//         .ph-search:focus { border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.1); }
//         .ph-wrap { max-height:400px;overflow-y:auto;border-radius:8px; }
//         .ph-table { width:100%;border-collapse:collapse;font-size:13px; }
//         .ph-table th { background:#f9fafb;font-weight:700;color:#374151;
//           padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left; }
//         .ph-table td { padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151; }
//         .ph-table .purchase-row:hover td { background:#eff6ff;color:#1d4ed8; }
//       </style>
//       <input type="text" class="ph-search" placeholder="🔍 Search by vendor…"
//         onkeyup="filterPurchaseTable(this.value)">
//       <div class="ph-wrap">
//         <table class="ph-table">
//           <thead>
//             <tr><th>#</th><th>Invoice</th><th>Date</th><th>Vendor</th><th>Amount</th></tr>
//           </thead>
//           <tbody id="purchaseSummaryBody">${rows}</tbody>
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
//         if (el.dataset.pt !== undefined) { el.setAttribute("tabindex",el.dataset.pt); delete el.dataset.pt; }
//         else el.removeAttribute("tabindex");
//       });
//     }

//     disableBg();
//     Swal.fire({
//       title:"📜 Purchase History", html, width:"720px",
//       confirmButtonText:"Close", confirmButtonColor:"#2563eb",
//       focusConfirm:false, allowOutsideClick:false, allowEscapeKey:true,
//       didOpen: popup => {
//         document.querySelectorAll("input,textarea,select").forEach(el => el.blur());
//         popup.addEventListener("focusin",  e => e.stopPropagation());
//         popup.addEventListener("keydown",  e => e.stopPropagation());
//         setTimeout(() => {
//           const inp = popup.querySelector(".ph-search");
//           if (inp) { inp.focus(); inp.select(); }
//         }, 80);
//       },
//       willClose: enableBg,
//     });
//   } catch (err) {
//     Swal.fire({ icon:"error", title:"Network Error", text: err.message||"Cannot fetch." });
//   }
// }

// function filterPurchaseTable(query) {
//   query = query.toLowerCase().trim();
//   document.querySelectorAll("#purchaseSummaryBody .purchase-row").forEach(row => {
//     row.style.display = row.dataset.vendor.includes(query) ? "" : "none";
//   });
// }

// function purchaseHistory()  { fetchPurchaseSummary(); }
// function purchaseDateWise() {
//   const today = new Date().toISOString().split("T")[0];
//   Swal.fire({
//     title:"📅 Select Date Range",
//     html:`
//       <div style="text-align:left;margin:8px 0;">
//         <label style="font-size:13px;color:#6b7280;">From Date</label>
//         <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:4px 0 12px;">
//         <label style="font-size:13px;color:#6b7280;">To Date</label>
//         <input type="date" id="toDate" class="swal2-input"
//           style="width:100%;margin:4px 0;" value="${today}">
//       </div>
//     `,
//     focusConfirm:false, showCancelButton:true,
//     confirmButtonText:"Fetch Purchases", confirmButtonColor:"#2563eb",
//     preConfirm:() => {
//       const f = document.getElementById("fromDate").value;
//       const t = document.getElementById("toDate").value;
//       if (!f||!t) { Swal.showValidationMessage("⚠️ Both dates required"); return false; }
//       return { fromDate:f, toDate:t };
//     },
//   }).then(r => { if (r.isConfirmed) fetchPurchaseSummary(r.value.fromDate, r.value.toDate); });
// }

// function viewPurchaseDetails(purchaseId) {
//   document.getElementById("current_purchase_id").value = purchaseId;
//   navigatePurchase("current");
//   Swal.close();
// }


/* ============================================================
   PURCHASE PAGE — COMPLETE SCRIPT
   Features:
     - Fuzzy item autocomplete (substring match, starts-with ranked first)
     - Bulk serial paste per row (item must be selected first)
     - Serial comments default to "All Ok"
     - Instant duplicate detection: within-invoice AND stock history
     - Total Items / Total Qty / Total Amount
     - PDF download (PKR currency)
     - Previous / Next / Current navigation
     - Purchase history summary popup
   ============================================================ */

// ── Utilities ──────────────────────────────────────────────────────────────
function _norm(s) { return (s == null ? "" : String(s)).trim(); }

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function getCSRFToken() {
  for (const c of document.cookie.split(";").map(s=>s.trim())) {
    if (c.startsWith("csrftoken=")) return decodeURIComponent(c.slice(10));
  }
  return null;
}

const SERIAL_SEP_RE = /[\r\n\t,;]+/;

// ── Totals ─────────────────────────────────────────────────────────────────
function calculateTotal() {
  let amount=0, qty=0, items=0;
  document.querySelectorAll(".item-row").forEach(row => {
    const p = parseFloat(row.querySelector(".unit_price")?.value) || 0;
    const q = parseInt(row.querySelector(".qty-box")?.value) || 0;
    amount += p * q;
    qty    += q;
    if (q > 0 || p > 0) items++;
  });
  document.getElementById("totalAmount").textContent     = amount.toFixed(2);
  document.getElementById("totalQtyCount").textContent   = qty;
  document.getElementById("totalItemsCount").textContent = items;
}

function updateQty(row) {
  const filled = Array.from(row.querySelectorAll(".serials .sn"))
    .filter(i => i.value.trim()).length;
  row.querySelector(".qty-box").value = filled;
  calculateTotal();
}


// ── Collect all serial values in form (for cross-row dupe check) ────────────
function collectAllSNs(exceptInput = null) {
  const map = new Map(); // UPPER → input el
  document.querySelectorAll(".item-row .serials .sn").forEach(inp => {
    if (inp === exceptInput) return;
    const v = _norm(inp.value);
    if (v) map.set(v.toUpperCase(), inp);
  });
  return map;
}


// ── Serial status validation (batch, calls backend) ──────────────────────────
// Returns a Promise resolving to:
//   { SERIAL_UPPER: {status:"ok"|"in_stock"|"ever_existed"|"error", label:""} }
function checkSerialsWithBackend(serials, purchaseId = null) {
  if (!serials.length) return Promise.resolve({});
  return fetch("/purchase/check-serials/", {
    method: "POST",
    headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify({ serials, purchase_id: purchaseId }),
  }).then(r => r.json()).then(data => {
    if (!data.success) return {};
    // key the result by uppercase serial
    const out = {};
    for (const [k, v] of Object.entries(data.results || {})) {
      out[k.toUpperCase()] = v;
    }
    return out;
  }).catch(() => ({}));
}


// ── Apply visual status tag to a serial pair ────────────────────────────────
function applySerialStatus(snInput, tagEl, status) {
  snInput.classList.remove("dup-self","dup-stock","dup-existed","dup-ok");
  tagEl.textContent = "";
  tagEl.className = "serial-status-tag";

  switch(status) {
    case "ok":
      snInput.classList.add("dup-ok");
      // no tag for clean serials — keep UI uncluttered
      break;
    case "dup":
      snInput.classList.add("dup-self");
      tagEl.textContent = "Duplicate";
      tagEl.classList.add("tag-dup");
      break;
    case "in_stock":
      snInput.classList.add("dup-stock");
      tagEl.textContent = "In Stock!";
      tagEl.classList.add("tag-stock");
      break;
    case "ever_existed":
      snInput.classList.add("dup-existed");
      tagEl.textContent = "Prev. System";
      tagEl.classList.add("tag-existed");
      break;
    default:
      break;
  }
}


// ── Re-validate all serials in one row after any change ─────────────────────
// This runs an instant pass for cross-row duplicates (no network),
// then fires the backend check for stock/history status.
function revalidateRowSerials(row) {
  const purchaseId = document.getElementById("current_purchase_id")?.value || null;
  const pairs      = Array.from(row.querySelectorAll(".serial-pair"));
  if (!pairs.length) return;

  // Step 1 — cross-row duplicates (instant, no network)
  // Exclude ALL inputs belonging to this row so they don't falsely match each other
  const rowSNs = new Set(Array.from(row.querySelectorAll(".sn")).map(i => i.value.trim().toUpperCase()).filter(Boolean));
  const formSerials = new Map([...collectAllSNs()].filter(([k]) => !rowSNs.has(k)));
  const seenInRow   = new Map();

  const toCheck = []; // serials to send for backend check

  pairs.forEach(pair => {
    const snInput = pair.querySelector(".sn");
    const tagEl   = pair.querySelector(".serial-status-tag");
    const v       = _norm(snInput.value);
    if (!v) { applySerialStatus(snInput, tagEl, ""); return; }

    const vUp = v.toUpperCase();

    if (seenInRow.has(vUp)) {
      // Duplicate within this row
      applySerialStatus(snInput, tagEl, "dup");
    } else if (formSerials.has(vUp)) {
      // Duplicate in another row
      applySerialStatus(snInput, tagEl, "dup");
    } else {
      seenInRow.set(vUp, snInput);
      toCheck.push({ serial: v, snInput, tagEl });
    }
  });

  if (!toCheck.length) return;

  // Step 2 — backend stock/history check (async, non-blocking)
  checkSerialsWithBackend(toCheck.map(t=>t.serial), purchaseId).then(results => {
    toCheck.forEach(({ serial, snInput, tagEl }) => {
      const r = results[serial.toUpperCase()];
      if (r) applySerialStatus(snInput, tagEl, r.status);
    });
  });
}


// ── addSerialPair — add one serial+comment row inside a row ─────────────────
function addSerialPair(row, serialValue = "", commentValue = "All Ok", autoFocus = true) {
  const serialsDiv = row.querySelector(".serials");

  const pair = document.createElement("div");
  pair.className = "serial-pair";

  const snInput  = document.createElement("input");
  snInput.type   = "text";
  snInput.className = "sn";
  snInput.placeholder = "Serial number…";
  snInput.value  = _norm(serialValue);

  const cmtInput = document.createElement("input");
  cmtInput.type  = "text";
  cmtInput.className = "cmt";
  cmtInput.placeholder = "Comment";
  cmtInput.maxLength   = 500;
  cmtInput.value = commentValue || "All Ok";

  const tagEl   = document.createElement("span");
  tagEl.className = "serial-status-tag";

  // Enter key: SN → comment → new pair
  snInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); cmtInput.focus(); }
  });
  cmtInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addSerialPair(row, "", "All Ok", true); }
  });

  // Paste interception on SN: if multi-line, route to bulk processor
  snInput.addEventListener("paste", e => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && SERIAL_SEP_RE.test(text)) {
      e.preventDefault();
      snInput.value = "";
      openBulkForRow(row, text);
    }
  });

  // Validate on change/input
  snInput.addEventListener("change",  () => { updateQty(row); revalidateRowSerials(row); });
  snInput.addEventListener("input",   () => updateQty(row));

  pair.appendChild(snInput);
  pair.appendChild(cmtInput);
  pair.appendChild(tagEl);
  serialsDiv.appendChild(pair);

  updateQty(row);
  if (autoFocus) snInput.focus();

  // Validation on load is intentionally skipped for performance.
  // revalidateRowSerials() is called only on user interaction (change event).
}

function removeSerial(row) {
  const serialsDiv = row.querySelector(".serials");
  const pairs = serialsDiv.querySelectorAll(".serial-pair");
  if (pairs.length > 0) {
    pairs[pairs.length - 1].remove();
    updateQty(row);
    revalidateRowSerials(row);
    const remaining = serialsDiv.querySelectorAll(".sn");
    if (remaining.length) remaining[remaining.length-1].focus();
    else row.querySelector(".add-serial-btn")?.focus();
  }
}


// ── Bulk paste for a specific row ────────────────────────────────────────────
function openBulkForRow(row, prefill = "") {
  const itemName = _norm(row.querySelector(".item_name")?.value);
  if (!itemName) {
    Swal.fire({ icon: "warning", title: "Select Item First",
      text: "Please choose an item name before pasting bulk serials." });
    return;
  }

  Swal.fire({
    title: `📋 Bulk Paste — ${escapeHtml(itemName)}`,
    html: `
      <div style="text-align:left;font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5;">
        Paste serial numbers (newline, tab, comma, or semicolon separated).<br>
        Each serial gets a default comment <b>"All Ok"</b>. Duplicates &amp; stock conflicts are highlighted automatically.
      </div>
      <textarea id="bulkTA"
        style="width:100%;min-height:190px;padding:12px;font-family:'DM Mono',monospace;
               font-size:13px;border:1.5px solid #e5e7eb;border-radius:10px;resize:vertical;
               background:#f9fafb;color:#111827;"
        placeholder="SN001&#10;SN002&#10;SN003&#10;…">${escapeHtml(prefill)}</textarea>
    `,
    showCancelButton: true,
    confirmButtonText: "Add Serials",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#2563eb",
    focusConfirm: false,
    width: "540px",
    preConfirm: () => {
      const ta = document.getElementById("bulkTA");
      if (!ta || !ta.value.trim()) {
        Swal.showValidationMessage("⚠️ Paste at least one serial number.");
        return false;
      }
      return ta.value;
    },
    didOpen: () => { const ta = document.getElementById("bulkTA"); if (ta) ta.focus(); }
  }).then(res => {
    if (!res.isConfirmed || !res.value) return;
    const raw = res.value;

    // Parse
    const tokens = raw.split(SERIAL_SEP_RE)
      .map(s => s.trim()).filter(Boolean);

    if (!tokens.length) return;

    // Dedup within pasted text
    const seen = new Set();
    const unique = [];
    const intraDups = [];
    tokens.forEach(t => {
      const k = t.toUpperCase();
      if (seen.has(k)) { intraDups.push(t); }
      else { seen.add(k); unique.push(t); }
    });

    // Cross-row dupe check (instant)
    const formSNs  = collectAllSNs();
    const accepted = [];
    const crossDups = [];

    unique.forEach(t => {
      if (formSNs.has(t.toUpperCase())) { crossDups.push(t); }
      else accepted.push(t);
    });

    // Add the accepted ones as serial pairs
    accepted.forEach(sn => addSerialPair(row, sn, "All Ok", false));

    // Trigger backend validation for the whole row
    setTimeout(() => revalidateRowSerials(row), 100);
    calculateTotal();

    // Summary
    const totalDups = intraDups.length + crossDups.length;
    const dupDetails = [
      ...(intraDups.length ? [`${intraDups.length} duplicate(s) within pasted text`] : []),
      ...(crossDups.length ? [`${crossDups.length} already in another row`] : []),
    ].join(", ");

    Swal.fire({
      icon: accepted.length ? "success" : "warning",
      title: "Bulk Serial Result",
      html: `
        <div style="text-align:left;line-height:1.8;font-size:14px;">
          <div>📥 Total pasted: <b>${tokens.length}</b></div>
          <div>✅ Added: <b style="color:#16a34a;">${accepted.length}</b></div>
          <div>⚠️ Duplicates skipped: <b style="color:#d97706;">${totalDups}</b>
            ${totalDups ? `<span style="font-size:12px;color:#9ca3af;"> (${dupDetails})</span>` : ""}
          </div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#6b7280;">
          ⚠️ Stock conflicts are shown inline in red/purple on the serial fields.
        </div>
      `,
    });
  });
}


// ── addItemRow ────────────────────────────────────────────────────────────────
function addItemRow(shouldFocus = true) {
  const itemsDiv = document.getElementById("items");
  const row = document.createElement("div");
  row.className = "item-row purchase-row";

  row.innerHTML = `
    <div class="item_name_field autocomplete-container">
      <input type="text" class="item_name item_search_name sale-input"
        placeholder="Search item name…" autocomplete="off"
        data-autocomplete-url="${autocompleteItemUrl}"
        style="font-size:0.87rem;">
      <div class="items_suggestions"></div>
    </div>
    <input type="number" class="unit_price" step="0.01" min="0" placeholder="0.00">
    <input type="number" class="qty-box" readonly value="0">
    <div></div>
    <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
    <div class="row-actions">
      <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
      <button type="button" class="custom-btn remove-serial">− Serial</button>
      <button type="button" class="custom-btn btn-bulk bulk-row-btn" title="Paste bulk serials for this item">
        <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
      </button>
      <button type="button" class="custom-btn remove-item">✕ Remove</button>
    </div>
  `;

  row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
  row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
  row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
  row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
  row.querySelector(".unit_price").oninput     = () => calculateTotal();

  itemsDiv.appendChild(row);
  addSerialPair(row, "", "All Ok", false);

  if (shouldFocus) row.querySelector(".item_name").focus();
}


// ── Build & Submit ────────────────────────────────────────────────────────────
function buildAndSubmit(event) {
  event.preventDefault();
  const form   = event.target;
  const action = form.querySelector('button[type="submit"][clicked="true"]')?.value;

  const partyName = document.getElementById("search_name").value.trim();
  let purchaseDate = document.getElementById("purchase_date").value;
  if (!purchaseDate) purchaseDate = new Date().toISOString().slice(0,10);

  if (!partyName) {
    Swal.fire({ icon:"warning", title:"Missing Vendor",
      text:"Please enter a vendor / party name." });
    document.getElementById("search_name").focus();
    return;
  }

  const items = [];
  document.querySelectorAll(".item-row").forEach(row => {
    const item_name  = _norm(row.querySelector(".item_name")?.value);
    const unit_price = parseFloat(row.querySelector(".unit_price")?.value);
    const serials    = Array.from(row.querySelectorAll(".serial-pair"))
      .map(pair => ({
        serial:  _norm(pair.querySelector(".sn")?.value),
        comment: _norm(pair.querySelector(".cmt")?.value) || "All Ok",
      }))
      .filter(s => s.serial);

    if (item_name && serials.length && !isNaN(unit_price) && unit_price > 0) {
      items.push({ item_name, qty: serials.length, unit_price, serials });
    }
  });

  if (items.length === 0) {
    Swal.fire({ icon:"warning", title:"No Valid Items",
      text:"Add at least one item with a serial number and price > 0." });
    return;
  }

  const purchaseId = document.getElementById("current_purchase_id")?.value || null;
  const description = (document.getElementById("purchase_description")?.value || "").trim();
  const payload    = { party_name: partyName, purchase_date: purchaseDate,
                       items, action, description };
  if (purchaseId) payload.purchase_id = purchaseId;

  fetch("/purchase/purchasing/", {
    method: "POST",
    headers: { "Content-Type":"application/json", "X-CSRFToken": getCSRFToken() },
    body: JSON.stringify(payload),
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      Swal.fire({ icon:"success", title:"Success",
        text: data.message || "Purchase saved!", timer:1600, showConfirmButton:false })
      .then(() => window.location.reload());
    } else {
      Swal.fire({ icon:"error", title:"Error",
        text: data.message || "Something went wrong." });
    }
  })
  .catch(() => Swal.fire({ icon:"error", title:"Network Error",
    text:"Could not reach server." }));
}


// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteButton = document.querySelector(".delete-btn");
function confirmDelete(event) {
  event.preventDefault();
  Swal.fire({
    title:"Delete this Purchase?", text:"This cannot be undone.", icon:"warning",
    showCancelButton:true, confirmButtonColor:"#dc2626", cancelButtonColor:"#6b7280",
    confirmButtonText:"Yes, delete", cancelButtonText:"Cancel",
  }).then(r => {
    if (r.isConfirmed) {
      deleteButton.removeEventListener("click", confirmDelete);
      deleteButton.click();
      setTimeout(() => deleteButton.addEventListener("click", confirmDelete), 120);
    }
  });
}
if (deleteButton) deleteButton.addEventListener("click", confirmDelete);

document.querySelectorAll('button[type="submit"]').forEach(btn => {
  btn.addEventListener("click", function () {
    document.querySelectorAll('button[type="submit"]').forEach(b=>b.removeAttribute("clicked"));
    this.setAttribute("clicked","true");
  });
});


// ── On load ──────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  for (let i = 0; i < 3; i++) addItemRow(false);
  calculateTotal();
  document.getElementById("purchase_date").value = new Date().toISOString().slice(0,10);
});


// ── Party autocomplete (fuzzy, starts-with ranked first) ─────────────────────
$(document).ready(function () {
  const autocompleteUrl = $("#search_name").data("autocomplete-url");
  let selectedIndex = -1;

  $("#search_name").on("input", function () {
    const query = $(this).val().trim();
    const box   = $("#suggestions");
    selectedIndex = -1;

    if (query.length < 1) { box.hide(); return; }

    $.ajax({ url: autocompleteUrl, data:{ term: query }, dataType:"json",
      success(data) {
        box.empty();
        if (!data.length) { box.hide(); return; }
        data.forEach(party => {
          const highlighted = highlightMatch(party, query);
          $("<div>").addClass("suggestion-item")
            .html(highlighted)
            .data("value", party)
            .appendTo(box)
            .on("click", function () {
              $("#search_name").val($(this).data("value"));
              box.hide();
              // Focus first serial input
              const fs = document.querySelector(".item-row .sn");
              if (fs) fs.focus();
            });
        });
        box.show();
      }
    });
  });

  $("#search_name").on("keydown", function (e) {
    const items = $("#suggestions .suggestion-item");
    if (!items.length) return;
    if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault(); selectedIndex = (selectedIndex+1)%items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); selectedIndex = (selectedIndex-1+items.length)%items.length;
      items.removeClass("highlight").eq(selectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault(); items.eq(selectedIndex).trigger("click");
    }
  });

  $(document).on("click", e => {
    if (!$(e.target).closest("#search_name, #suggestions").length) $("#suggestions").hide();
  });
});

// Highlight matching substring in suggestion text
function highlightMatch(text, query) {
  const idx = text.toUpperCase().indexOf(query.toUpperCase());
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx))
    + `<b style="color:#2563eb;">${escapeHtml(text.slice(idx, idx+query.length))}</b>`
    + escapeHtml(text.slice(idx + query.length));
}


// ── Item name autocomplete (fuzzy) ────────────────────────────────────────────
let _itemSelectedIndex = -1;

$(document).on("input", ".item_search_name", function () {
  const input  = $(this);
  const query  = input.val().trim();
  const box    = input.siblings(".items_suggestions");
  const url    = input.data("autocomplete-url");
  _itemSelectedIndex = -1;

  if (query.length < 1) { box.hide(); return; }

  $.ajax({ url, data:{ term: query }, dataType:"json",
    success(data) {
      box.empty();
      if (!data.length) { box.hide(); return; }
      data.forEach(item => {
        const highlighted = highlightMatch(item, query);
        $("<div>").addClass("suggestion-item")
          .html(highlighted)
          .data("value", item)
          .appendTo(box)
          .on("click", function () {
            input.val($(this).data("value"));
            box.hide();
            // Focus first serial in this row
            const row = input.closest(".item-row")[0];
            if (row) {
              const sn = row.querySelector(".sn");
              if (sn) sn.focus();
            }
          });
      });
      box.show();
    }
  });
});

$(document).on("keydown", ".item_search_name", function (e) {
  const input  = $(this);
  const box    = input.siblings(".items_suggestions");
  const items  = box.find(".suggestion-item");
  if (!items.length) return;
  if (e.key === "Enter" && items.length === 1) { e.preventDefault(); items.eq(0).trigger("click"); return; }
  if (e.key === "ArrowDown") {
    e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex+1)%items.length;
    items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
  } else if (e.key === "ArrowUp") {
    e.preventDefault(); _itemSelectedIndex = (_itemSelectedIndex-1+items.length)%items.length;
    items.removeClass("highlight").eq(_itemSelectedIndex).addClass("highlight")[0].scrollIntoView({block:"nearest"});
  } else if (e.key === "Enter" && _itemSelectedIndex >= 0) {
    e.preventDefault(); items.eq(_itemSelectedIndex).trigger("click");
  }
});

$(document).on("click", e => {
  if (!$(e.target).closest(".item_search_name, .items_suggestions").length)
    $(".items_suggestions").hide();
});


// ── Navigate purchase invoices ────────────────────────────────────────────────
async function navigatePurchase(action) {
  try {
    const currentId = document.getElementById("current_purchase_id").value || "";
    const res = await fetch(
      `/purchase/get-purchase/?action=${action}&current_id=${currentId}`,
      { method:"GET", headers:{"X-Requested-With":"XMLHttpRequest"} }
    );
    let data = await res.json();
    if (data.success === false) {
      Swal.fire({ icon:"info", title:"Navigation", text: data.message || "Not found." });
      return;
    }
    if (typeof data === "string") data = JSON.parse(data);
    if (typeof data === "object" && !("purchase_invoice_id" in data)) {
      try { data = JSON.parse(Object.values(data)[0]); } catch {}
    }
    renderPurchaseData(data);
  } catch {
    Swal.fire({ icon:"error", title:"Error", text:"Failed to load purchase data." });
  }
}

function renderPurchaseData(data) {
  document.getElementById("search_name").value         = data.Party || "";
  document.getElementById("purchase_date").value       = data.invoice_date || "";
  document.getElementById("current_purchase_id").value = data.purchase_invoice_id || "";
  const _pDescEl = document.getElementById("purchase_description");
  if (_pDescEl) _pDescEl.value = data.description || "";

  const badge = document.getElementById("invoiceIdBadge");
  if (badge) badge.textContent = data.purchase_invoice_id ? `#${data.purchase_invoice_id}` : "#NEW";

  // Update "Entry by" badge
  const entryByName = document.getElementById("entryByName");
  if (entryByName) {
    entryByName.textContent = data.created_by || "—";
  }

  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.innerHTML = data.purchase_invoice_id
      ? '<i class="fa-solid fa-pen-to-square"></i> Update Purchase'
      : '<i class="fa-solid fa-floppy-disk"></i> Save Purchase';
  }

  const itemsDiv = document.getElementById("items");
  itemsDiv.innerHTML = "";

  if (Array.isArray(data.items)) {
    data.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "item-row purchase-row";
      row.innerHTML = `
        <div class="item_name_field autocomplete-container">
          <input type="text" class="item_name item_search_name sale-input"
            value="${escapeHtml(item.item_name||"")}"
            placeholder="Item name" autocomplete="off"
            data-autocomplete-url="${autocompleteItemUrl}"
            style="font-size:0.87rem;">
          <div class="items_suggestions"></div>
        </div>
        <input type="number" class="unit_price" step="0.01" min="0"
          placeholder="0.00" value="${item.unit_price||0}">
        <input type="number" class="qty-box" readonly value="${item.qty||0}">
        <div></div>
        <div class="serials" style="display:flex;flex-direction:column;gap:4px;"></div>
        <div class="row-actions">
          <button type="button" class="custom-btn add-serial add-serial-btn">＋ Serial</button>
          <button type="button" class="custom-btn remove-serial">− Serial</button>
          <button type="button" class="custom-btn btn-bulk bulk-row-btn"
            title="Paste bulk serials">
            <i class="fa-solid fa-list" style="font-size:10px;"></i> Bulk
          </button>
          <button type="button" class="custom-btn remove-item">✕ Remove</button>
        </div>
      `;

      row.querySelector(".add-serial-btn").onclick = () => addSerialPair(row);
      row.querySelector(".remove-serial").onclick  = () => removeSerial(row);
      row.querySelector(".bulk-row-btn").onclick   = () => openBulkForRow(row);
      row.querySelector(".remove-item").onclick    = () => { row.remove(); calculateTotal(); };
      row.querySelector(".unit_price").oninput     = () => calculateTotal();

      if (Array.isArray(item.serials)) {
        item.serials.forEach(sd => {
          let sn = "", cmt = "All Ok";
          if (typeof sd === "string") { sn = sd; }
          else if (sd && typeof sd === "object") {
            sn  = sd.serial  || "";
            cmt = sd.comment || "All Ok";
          }
          addSerialPair(row, sn, cmt, false);
        });
      }

      itemsDiv.appendChild(row);
      updateQty(row);
    });
  }

  document.getElementById("totalAmount").textContent =
    data.total_amount ? parseFloat(data.total_amount).toFixed(2) : "0.00";
  calculateTotal();

  // Validation intentionally skipped on render — runs on user interaction only.
}


// ── PDF Download ──────────────────────────────────────────────────────────────
function downloadInvoicePDF() {
  const partyName   = document.getElementById("search_name").value.trim();
  const purchDate   = document.getElementById("purchase_date").value;
  const invoiceId   = document.getElementById("current_purchase_id").value;
  const amount      = document.getElementById("totalAmount").textContent;
  const totalQty    = document.getElementById("totalQtyCount").textContent;

  if (!partyName) {
    Swal.fire({ icon:"warning", title:"No Vendor",
      text:"Fill in the vendor name before downloading." });
    return;
  }

  const items = [];
  document.querySelectorAll(".item-row").forEach((row, i) => {
    const name  = _norm(row.querySelector(".item_name")?.value);
    const price = parseFloat(row.querySelector(".unit_price")?.value) || 0;
    const qty   = parseInt(row.querySelector(".qty-box")?.value) || 0;
    const serials = Array.from(row.querySelectorAll(".serial-pair"))
      .map(p => ({
        sn:  _norm(p.querySelector(".sn")?.value),
        cmt: _norm(p.querySelector(".cmt")?.value) || "All Ok"
      }))
      .filter(s => s.sn);
    if (name && qty > 0) items.push({ no:i+1, name, price, qty, serials, subtotal:price*qty });
  });

  if (!items.length) {
    Swal.fire({ icon:"warning", title:"Nothing to Export",
      text:"Add items with serials and price first." });
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W=210, PL=14, PR=196;
  let y=0;

  // Header band
  doc.setFillColor(15, 40, 80);
  doc.rect(0,0,W,44,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(22);
  doc.text("PURCHASE INVOICE", PL, 18);
  doc.setFont("helvetica","normal");
  doc.setFontSize(10);
  doc.text("Finance Management System", PL, 27);
  doc.setFontSize(9);
  doc.text(`Invoice #: ${invoiceId||"DRAFT"}`, PR, 14, {align:"right"});
  doc.text(`Date: ${purchDate||new Date().toLocaleDateString()}`, PR, 22, {align:"right"});
  doc.text(`Vendor: ${partyName}`, PR, 30, {align:"right"});

  y = 54;

  // Summary band
  doc.setFillColor(236, 242, 255);
  doc.rect(PL-2, y-6, W-(PL-2)*2, 12, "F");
  doc.setTextColor(15, 40, 80);
  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.text(`Total Qty: ${totalQty}   ·   Total Items: ${items.length}   ·   Invoice Amount: PKR ${amount}`, PL, y+1);

  y += 14;

  // Table header
  doc.setFillColor(15, 40, 80);
  doc.rect(PL-2, y, W-(PL-2)*2, 8, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(8);
  doc.text("#",          PL,     y+5.5);
  doc.text("ITEM",       PL+10,  y+5.5);
  doc.text("QTY",        PL+82,  y+5.5);
  doc.text("UNIT PRICE", PL+100, y+5.5);
  doc.text("SUBTOTAL",   PR,     y+5.5, {align:"right"});
  y += 10;

  // Rows
  doc.setFont("helvetica","normal");
  doc.setFontSize(8);
  doc.setTextColor(20,20,20);

  items.forEach((item, idx) => {
    // Estimate row height: item header + serial lines (2 per line, serial + comment)
    const snLines = Math.ceil(item.serials.length / 2);
    const rowH = 8 + snLines * 5;

    if (y + rowH > 270) { doc.addPage(); y = 20; }

    if (idx % 2 === 0) {
      doc.setFillColor(248,250,252);
      doc.rect(PL-2, y-2, W-(PL-2)*2, rowH, "F");
    }

    doc.text(String(item.no), PL, y+3.5);
    doc.setFont("helvetica","bold");
    doc.text(item.name, PL+10, y+3.5);
    doc.setFont("helvetica","normal");
    doc.text(String(item.qty), PL+82, y+3.5);
    doc.text(`PKR ${item.price.toFixed(2)}`, PL+100, y+3.5);
    doc.text(`PKR ${item.subtotal.toFixed(2)}`, PR, y+3.5, {align:"right"});

    // Serials: 2 per line  (SN | comment)
    if (item.serials.length) {
      doc.setFontSize(7);
      doc.setTextColor(100,100,120);
      for (let i=0; i<item.serials.length; i+=2) {
        const a = item.serials[i];
        const b = item.serials[i+1];
        const lineY = y + 8 + Math.floor(i/2)*5;
        const aText = `${a.sn}${a.cmt && a.cmt !== "All Ok" ? ` (${a.cmt})` : ""}`;
        const bText = b ? `   ${b.sn}${b.cmt && b.cmt !== "All Ok" ? ` (${b.cmt})` : ""}` : "";
        doc.text(aText + bText, PL+10, lineY);
      }
      doc.setFontSize(8);
      doc.setTextColor(20,20,20);
    }

    doc.setDrawColor(229,231,235);
    doc.setLineWidth(0.2);
    doc.line(PL-2, y+rowH-2, PR+2, y+rowH-2);
    y += rowH;
  });

  // Total band
  y += 4;
  if (y > 264) { doc.addPage(); y=20; }
  doc.setFillColor(15,40,80);
  doc.rect(PL-2, y, W-(PL-2)*2, 10, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(10);
  doc.text(`TOTAL AMOUNT:  PKR ${amount}`, PR, y+7, {align:"right"});

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(150,150,150);
  doc.setFont("helvetica","normal");
  doc.text("Generated by Finance Management System", W/2, 290, {align:"center"});
  doc.text(`Printed on ${new Date().toLocaleString()}`, W/2, 294, {align:"center"});

  const fn = invoiceId
    ? `Purchase_Invoice_${invoiceId}.pdf`
    : `Purchase_Invoice_DRAFT_${Date.now()}.pdf`;
  doc.save(fn);
}


// ── Purchase history popup ────────────────────────────────────────────────────
async function fetchPurchaseSummary(from = null, to = null) {
  try {
    let url = "/purchase/get-purchase-summary/";
    if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (!data.success && !Array.isArray(data)) {
      Swal.fire({ icon:"error", title:"Error", text: data.message||"Failed to fetch." });
      return;
    }

    let rows = "";
    if (Array.isArray(data) && data.length) {
      data.forEach((p, idx) => {
        rows += `
          <tr class="purchase-row" data-vendor="${escapeHtml(p.vendor.toLowerCase())}"
            onclick="viewPurchaseDetails(${p.purchase_invoice_id})" style="cursor:pointer;">
            <td>${idx+1}</td>
            <td><b>#${p.purchase_invoice_id}</b></td>
            <td>${p.invoice_date}</td>
            <td>${escapeHtml(p.vendor)}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;">
              PKR ${parseFloat(p.total_amount).toFixed(2)}
            </td>
          </tr>`;
      });
    } else {
      rows = `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No records found</td></tr>`;
    }

    const html = `
      <style>
        .ph-search { width:100%;padding:9px 14px;margin-bottom:10px;
          border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;
          outline:none;font-family:inherit; }
        .ph-search:focus { border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.1); }
        .ph-wrap { max-height:400px;overflow-y:auto;border-radius:8px; }
        .ph-table { width:100%;border-collapse:collapse;font-size:13px; }
        .ph-table th { background:#f9fafb;font-weight:700;color:#374151;
          padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left; }
        .ph-table td { padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151; }
        .ph-table .purchase-row:hover td { background:#eff6ff;color:#1d4ed8; }
      </style>
      <input type="text" class="ph-search" placeholder="🔍 Search by vendor…"
        onkeyup="filterPurchaseTable(this.value)">
      <div class="ph-wrap">
        <table class="ph-table">
          <thead>
            <tr><th>#</th><th>Invoice</th><th>Date</th><th>Vendor</th><th>Amount</th></tr>
          </thead>
          <tbody id="purchaseSummaryBody">${rows}</tbody>
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
        if (el.dataset.pt !== undefined) { el.setAttribute("tabindex",el.dataset.pt); delete el.dataset.pt; }
        else el.removeAttribute("tabindex");
      });
    }

    disableBg();
    Swal.fire({
      title:"📜 Purchase History", html, width:"720px",
      confirmButtonText:"Close", confirmButtonColor:"#2563eb",
      focusConfirm:false, allowOutsideClick:false, allowEscapeKey:true,
      didOpen: popup => {
        document.querySelectorAll("input,textarea,select").forEach(el => el.blur());
        popup.addEventListener("focusin",  e => e.stopPropagation());
        popup.addEventListener("keydown",  e => e.stopPropagation());
        setTimeout(() => {
          const inp = popup.querySelector(".ph-search");
          if (inp) { inp.focus(); inp.select(); }
        }, 80);
      },
      willClose: enableBg,
    });
  } catch (err) {
    Swal.fire({ icon:"error", title:"Network Error", text: err.message||"Cannot fetch." });
  }
}

function filterPurchaseTable(query) {
  query = query.toLowerCase().trim();
  document.querySelectorAll("#purchaseSummaryBody .purchase-row").forEach(row => {
    row.style.display = row.dataset.vendor.includes(query) ? "" : "none";
  });
}

function purchaseHistory()  { fetchPurchaseSummary(); }
function purchaseDateWise() {
  const today = new Date().toISOString().split("T")[0];
  Swal.fire({
    title:"📅 Select Date Range",
    html:`
      <div style="text-align:left;margin:8px 0;">
        <label style="font-size:13px;color:#6b7280;">From Date</label>
        <input type="date" id="fromDate" class="swal2-input" style="width:100%;margin:4px 0 12px;">
        <label style="font-size:13px;color:#6b7280;">To Date</label>
        <input type="date" id="toDate" class="swal2-input"
          style="width:100%;margin:4px 0;" value="${today}">
      </div>
    `,
    focusConfirm:false, showCancelButton:true,
    confirmButtonText:"Fetch Purchases", confirmButtonColor:"#2563eb",
    preConfirm:() => {
      const f = document.getElementById("fromDate").value;
      const t = document.getElementById("toDate").value;
      if (!f||!t) { Swal.showValidationMessage("⚠️ Both dates required"); return false; }
      return { fromDate:f, toDate:t };
    },
  }).then(r => { if (r.isConfirmed) fetchPurchaseSummary(r.value.fromDate, r.value.toDate); });
}

function viewPurchaseDetails(purchaseId) {
  document.getElementById("current_purchase_id").value = purchaseId;
  navigatePurchase("current");
  Swal.close();
}