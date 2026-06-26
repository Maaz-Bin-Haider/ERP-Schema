# from django.shortcuts import render,redirect

import logging
logger = logging.getLogger(__name__)
# from django.http import JsonResponse
# from django.contrib import messages
# from django.db import connection
# from datetime import datetime, date
# import json
# from django.contrib.auth.decorators import login_required

# # Create your views here.

# @login_required
# def purchasing(request):
#     if not request.user.has_perm("auth.view_purchase"):
#         messages.error(request, "You do not have permission to View Purchase Invoices.")
#         return redirect("home:home")
    
#     if request.method == 'POST':
#         try:
#             data = json.loads(request.body)
#             action = data.get("action")  
#             purchase_id = data.get("purchase_id")
#             if purchase_id:
#                 purchase_id = int(purchase_id)
#         except json.JSONDecodeError:
#             return JsonResponse({"success": False, "message": "Invalid JSON"})
        
#         if action == "submit":
            
#             try:
#                 data = json.loads(request.body)
#                 # validation example
#                 if not data.get("party_name"):
#                     return JsonResponse({"success": False, "message": "Party name is required."})
                
#                 if not data.get("purchase_date"):
#                     return JsonResponse({"success": False, "message": "Date name is required."})
                
#                 if not data.get("items"):
#                     return JsonResponse({"success": False, "message": "Atlest one item is required to make a Purchase"})
                

#                 try:
#                     # Validating Party name
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
#                         exists = cursor.fetchone()

#                         if not exists:
#                             return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Invalid Party-Name"})

#                 # Validate purchase_date (must be in correct date format)
#                 try:
#                     # Adjust format according to your input (e.g. "YYYY-MM-DD")
#                     purchase_date = datetime.strptime(data.get("purchase_date"), "%Y-%m-%d").date()

#                     # Future Date Restriction
#                     if purchase_date > date.today():
#                         return JsonResponse({"success": False, "message": "Purchase date cannot be in the future."})

#                     # Making Date again Str
#                     purchase_date = purchase_date.strftime("%Y-%m-%d")

#                 except (ValueError, TypeError):
#                     return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
#                 # validate Items
#                 try: 
#                     for item in data.get("items"):
#                         item_name = item["item_name"]
#                         qty = item["qty"]
#                         unit_price = item["unit_price"]
#                         serials = item["serials"]


#                         # validating item name
#                         try:
#                             with connection.cursor() as cursor:
#                                 cursor.execute("SELECT 1 FROM Items WHERE UPPER(item_name) = %s",[item_name.upper()])
#                                 exists = cursor.fetchone()

#                                 if not exists:
#                                     return JsonResponse({"success": False, "message": f"Item with '{item_name.upper()}' Not exists!"})
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Item-name"})

#                         # validating quantity 
#                         try:
#                             qty = int(qty)
#                             if qty <= 0:
#                                 return JsonResponse({"success": False, "message": "Invalid Quantity"})
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Quantity"})

#                         # validating unit price
#                         try:
#                             unit_price = float(unit_price)
#                             if unit_price <= 0:
#                                 return JsonResponse({"success": False, "message": "Invalid Price"})
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Price"})
                        

#                         # # Validating Serials
#                         # if not purchase_id:
#                         #     try:
#                         #         for serial in serials:

#                         #             with connection.cursor() as cursor:
#                         #                 cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])

#                         #                 exists = cursor.fetchone()

#                         #                 if exists:
#                         #                     return JsonResponse({"success": False, "message": f"The Serial '{serial}' already exists in Stock!"})
#                         #     except:
#                         #         return JsonResponse({"success": False, "message": "Invalid Serial Number!"})
                        
#                         # Validating Serials
#                         if not purchase_id:
#                             try:
#                                 for serial_obj in serials:
#                                     # Handle both old format (string) and new format (object)
#                                     if isinstance(serial_obj, dict):
#                                         serial_number = serial_obj.get('serial', '').strip()
#                                         serial_comment = (serial_obj.get('comment') or '').strip()
                                        
#                                         # Validate comment length (optional, frontend also validates)
#                                         if serial_comment and len(serial_comment) > 500:
#                                             return JsonResponse({
#                                                 "success": False, 
#                                                 "message": f"Comment for serial '{serial_number}' is too long (max 500 characters)."
#                                             })
#                                     else:
#                                         # Backward compatibility: old format was just serial string
#                                         serial_number = serial_obj.strip() if isinstance(serial_obj, str) else str(serial_obj)
                                    
#                                     # Check if serial already exists in stock
#                                     with connection.cursor() as cursor:
#                                         cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)", [serial_number])
#                                         exists = cursor.fetchone()
                                        
#                                         if exists:
#                                             return JsonResponse({
#                                                 "success": False, 
#                                                 "message": f"The Serial '{serial_number}' already exists in Stock!"
#                                             })
#                             except Exception as e:
#                                 return JsonResponse({
#                                     "success": False, 
#                                     "message": "Invalid Serial Number!"
#                                 })
                        
#                 except:
#                     return JsonResponse({"success": False, "message": "Unexpected Error Please try again!"})
                
#                 # Execute DB function
#                 if not purchase_id: # means new Purchase
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Purchase"
#                             })
                        
#                         #  Access check for Create Purchase Right
#                         if not request.user.has_perm("auth.create_purchase"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Create Purchase"
#                             })
#                         # Find the vendor ID
#                         with connection.cursor() as cursor:
#                             cursor.execute("""
#                                 SELECT party_id 
#                                 FROM Parties 
#                                 WHERE party_name = %s
#                             """, [data.get("party_name")])
#                             result = cursor.fetchone()
#                             if not result:
#                                 return JsonResponse({"success": False, "message": f"Party '{data.get("party_name")}' not found in Parties."})
#                             party_id = result[0]
                            
                            
#                             # Prepare your purchase items data
#                             items_data = []
#                             for item in data.get("items"):
#                                 items_data.append(item)

                    
#                             # Convert Python list → JSON string
#                             items_json = json.dumps(items_data)

#                             # Postgres function `create_purchase`
#                             cursor.execute("""
#                                 SELECT create_purchase(%s, %s, %s::jsonb, %s);
#                             """, [party_id, purchase_date, items_json,request.user.id])

#                             # Fetch the returned invoice ID
#                             invoice_id = cursor.fetchone()[0]
#                             return JsonResponse({"success": True, "message": "Purchase Successfull"})
#                     except Exception as e:
#                         return JsonResponse({"success": False, "message": f"Failed to make Purchase, try again! {e}"})  
#                 else: # if purchase ID Exists Means we have to update
#                     # Validating If any serial number is removed from updated invoice which is already sold or purchases Returned
#                     try:
                        
                        
#                         # Prepare your purchase items data
#                         items_data = []
#                         for item in data.get("items"):
#                             items_data.append(item)

                
#                         # Convert Python list → JSON string
#                         items_json = json.dumps(items_data)
                        
                        
#                         with connection.cursor() as cursor:
#                             cursor.execute("SELECT validate_purchase_update2(%s,%s)",[purchase_id,items_json])
#                             result = cursor.fetchone()[0]
#                             result = json.loads(result)
                            


#                             if not result["is_valid"]:
                                
#                                 sold_serials = result.get("sold_serials", [])
#                                 returned_serials = result.get("returned_serials", [])

#                                 # Build detailed message lines
#                                 details = []
#                                 if sold_serials:
#                                     details.append(f"• Sold Serials: {', '.join(sold_serials)}")
#                                 if returned_serials:
#                                     details.append(f"• Returned Serials: {', '.join(returned_serials)}")

#                                 message = (
#                                     "Update blocked: some serial numbers you are trying to remove "
#                                     "have already been sold or returned to the vendor.\n\n"
#                                     + "\n".join(details)
#                                 )

#                                 return JsonResponse({
#                                     "success": False,
#                                     "message": message
#                                 })
#                     except:
#                         return JsonResponse({"success": False, "message": "Update Failed Try Again!"})
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase"
#                             })
                        
#                         #  Access check for Update Purchase Right
#                         if not request.user.has_perm("auth.update_purchase"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase"
#                             })
                        
#                         with connection.cursor() as cursor:
#                             cursor.execute("""
#                                 SELECT party_id 
#                                 FROM Parties 
#                                 WHERE party_name = %s
#                             """, [data.get("party_name")])
#                             result = cursor.fetchone()
#                             if not result:
#                                 return JsonResponse({"success": False, "message": f"Party '{data.get("party_name")}' not found in Parties."})
#                             party_id = result[0]
                            
                            
#                             # Prepare your purchase items data
#                             items_data = []
#                             for item in data.get("items"):
#                                 items_data.append(item)

                    
#                             # Convert Python list → JSON string
#                             items_json = json.dumps(items_data)
                            
#                             # Postgres function `update_purchase_invoice`
#                             cursor.execute("""
#                                 SELECT update_purchase_invoice(%s, %s::jsonb, %s, %s);
#                             """, [purchase_id, items_json, data.get("party_name"), purchase_date])

#                             # Fetch the returned invoice ID
#                             invoice_id = cursor.fetchone()[0]
#                             return JsonResponse({"success": True, "message": "Update Successfull"})

#                     except:
#                         return JsonResponse({"success": False, "message": "Failed to Update Purchase, try again!"})  

                    

#             except Exception:
#                 return JsonResponse({"success": False, "message": "Invalid request data!"})

#         if action == "delete":
            
#             if not purchase_id:
#                 return JsonResponse({"success": False, "message": "Navigate to Purchase Invoice first!"})
            
#             # Validating If any serial number is removed before deleting any invoice which is already sold or purchases Returned
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT validate_purchase_delete(%s)",[purchase_id])
#                     result = cursor.fetchone()[0]
#                     result = json.loads(result)
                            
#                     if not result["is_valid"]:
#                         sold_serials = result.get("sold_serials", [])
#                         returned_serials = result.get("returned_serials", [])

#                         # Build detailed message lines
#                         details = []
#                         if sold_serials:
#                             details.append(f"• Sold Serials: {', '.join(sold_serials)}")
#                         if returned_serials:
#                             details.append(f"• Returned Serials: {', '.join(returned_serials)}")

#                         message = (
#                             "Delete blocked: some serial numbers you are trying to remove "
#                             "have already been sold or returned to the vendor.\n\n"
#                             + "\n".join(details)
#                         )

#                         return JsonResponse({
#                             "success": False,
#                             "message": message
#                         })
#             except:
#                 return JsonResponse({"success": False, "message": "Failed to Delete Purchase, try again!"})  
            
#             # Executing Delete
#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase"
#                     })
                
#                 #  Access check for Delete Purchase Right
#                 if not request.user.has_perm("auth.delete_purchase"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase"
#                     })
                
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT delete_purchase(%s)",[purchase_id])
#                     return JsonResponse({"success": True, "message": "Deleted Successfully"})
#             except Exception:
#                 return JsonResponse({"success": False, "message": "Unable to delete this Purchase! Try Again.."})
#     return render(request, "purchase_templates/purchasing_template.html")


# @login_required
# def get_purchase(request):
#     action = request.GET.get("action")
#     current_id = request.GET.get("current_id")
#     try:
#         if action == "previous":
            
#             if not current_id:
                
#                 # getting and  previous purchase ID
#                 try:
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT get_last_purchase_id()")
#                         last_purchase = cursor.fetchone()
                        
#                         if not last_purchase or not last_purchase[0]:
#                             return JsonResponse({"success": False, "message": "No Last Purchase!"})
                        
#                         try:
#                             last_purchase = last_purchase[0]
    
#                             current_id = int(last_purchase) + 1
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Last Purchase data!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase!"})
    
#             # Validating Current purchase ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "Invalid Previous Purchase ID!"})
            
#             # Fetching Previous purchase data from DB
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_previous_purchase(%s)",[current_id])
#                     result_data = cursor.fetchone()
                 
#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Previous Purchase Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase!"})
#         elif action == "next":
#             # Validating Current purchase ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Next Purchase Found"})
            
#             # Fetching Next purchase data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_next_purchase(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Next Purchase Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase!"})
            
#         elif action == "current": # If no action is provided means we have to fetch current purchase ID
            
#             # Validating Current purchase ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Purchase Found"})
            
#             # Fetching Next purchase data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_current_purchase(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase!"})
#         else:
#             pass
#     except:
#         return JsonResponse({"success": False, "message": "Data base Error!"})
    
#     # Sending to frontend
#     try:
        
#         return JsonResponse(result_data[0])
#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase data format."})


# @login_required
# def get_purchase_summary(request):
#     try:
#         from_date_str = request.GET.get("from")
#         to_date_str = request.GET.get("to")

#         # if user want purchasing summary in specific dates
#         if from_date_str or to_date_str:
#             # Validating Dates (must be in correct date format)
#             try:
#                 # Adjust format according to your input (e.g. "YYYY-MM-DD")
#                 from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
#                 to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()

#                 # Future Date Restriction
#                 if from_date > date.today() or to_date > date.today():
#                     return JsonResponse({"success": False, "message": "Dates can't be in Future"})

#                 # Making Date again Str
#                 from_date = from_date.strftime("%Y-%m-%d")
#                 to_date = to_date.strftime("%Y-%m-%d")

#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
            
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_purchase_summary(%s, %s)",[from_date,to_date])
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase Invoices found in the given date range!"})
#             except:
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase Invoices, Check your Internet Connection!"})
#         # if no date is specified then fetch last 20 purchase invoice summary
#         else:
            
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_purchase_summary()")
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase Invoices found"})
#             except Exception as e:
                
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase Invoices, Check your Internet Connection!"})
        
#         # now sending to frontend

#         try:
#             return JsonResponse(result[0], safe=False)
#         except Exception as e:
            
#             return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase data format."})
    

# # ---------------------------------------------------------------------------
# # Serial validation endpoint for Purchase page
# # POST /purchase/check-serials/
# # Body: {"serials": ["S1","S2",...], "purchase_id": null_or_int}
# #
# # For each serial this checks:
# #   1. Does a record exist at all in serial history?  → "ever_existed"
# #   2. Is it currently in_stock?                      → "in_stock"
# # This covers both:
# #   • Serials already purchased & in stock  (in_stock = true)
# #   • Serials that were purchased, sold, or returned (record exists but not in_stock)
# # Only serials with NO record at all are clean for a new purchase.
# # ---------------------------------------------------------------------------
# @login_required
# def purchase_serial_check(request):
#     if not request.user.has_perm("auth.view_purchase"):
#         return JsonResponse({"success": False, "message": "Permission denied."})
 
#     if request.method != "POST":
#         return JsonResponse({"success": False, "message": "POST required."})
 
#     try:
#         payload = json.loads(request.body or "{}")
#     except json.JSONDecodeError:
#         return JsonResponse({"success": False, "message": "Invalid JSON."})
 
#     serials   = payload.get("serials", [])
#     purchase_id = payload.get("purchase_id")   # when editing an existing invoice
 
#     if not isinstance(serials, list):
#         return JsonResponse({"success": False, "message": "'serials' must be a list."})
 
#     results = {}   # serial -> {status, label}
 
#     # If we're editing an existing invoice, serials that are ALREADY on that
#     # invoice are allowed (they belong to this purchase), so fetch them first.
#     existing_invoice_serials = set()
#     if purchase_id:
#         try:
#             with connection.cursor() as cursor:
#                 cursor.execute(
#                     "SELECT get_current_purchase(%s)", [int(purchase_id)]
#                 )
#                 row = cursor.fetchone()
#             if row and row[0]:
#                 inv = row[0]
#                 if isinstance(inv, str):
#                     import json as _j
#                     inv = _j.loads(inv)
#                 for item in (inv.get("items") or []):
#                     for s in (item.get("serials") or []):
#                         if isinstance(s, dict):
#                             existing_invoice_serials.add(s.get("serial", "").strip().upper())
#                         elif isinstance(s, str):
#                             existing_invoice_serials.add(s.strip().upper())
#         except Exception:
#             pass   # fall back gracefully — just won't whitelist existing serials
 
#     for serial in serials:
#         serial = str(serial).strip()
#         if not serial:
#             continue
 
#         if serial.upper() in existing_invoice_serials:
#             results[serial] = {"status": "ok", "label": ""}
#             continue
 
#         try:
#             with connection.cursor() as cursor:
#                 cursor.execute(
#                     "SELECT in_stock FROM get_serial_number_details(%s)", [serial]
#                 )
#                 row = cursor.fetchone()
 
#             if row is None:
#                 # No record at all — clean serial, fine for purchase
#                 results[serial] = {"status": "ok", "label": ""}
#             elif row[0]:
#                 # Record exists AND in_stock = true  → already in inventory
#                 results[serial] = {
#                     "status": "in_stock",
#                     "label": "Already in stock"
#                 }
#             else:
#                 # Record exists but not in_stock → was purchased before (sold/returned)
#                 results[serial] = {
#                     "status": "ever_existed",
#                     "label": "Previously in system"
#                 }
#         except Exception:
#             results[serial] = {"status": "error", "label": "Lookup failed"}
 
#     return JsonResponse({"success": True, "results": results})

from django.shortcuts import render,redirect
from django.http import JsonResponse
from django.contrib import messages
from django.db import connection
from datetime import datetime, date
import json
from django.contrib.auth.decorators import login_required

# Create your views here.

@login_required
def purchasing(request):
    if not request.user.has_perm("auth.view_purchase"):
        messages.error(request, "You do not have permission to View Purchase Invoices.")
        return redirect("home:home")
    
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            action = data.get("action")  
            purchase_id = data.get("purchase_id")
            if purchase_id:
                purchase_id = int(purchase_id)
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Invalid JSON"})
        
        if action == "submit":
            
            try:
                data = json.loads(request.body)
                _is_cash_purchase = (data.get("purchase_type") or "credit").lower() == "cash"
                # validation example
                if not _is_cash_purchase and not data.get("party_name"):
                    return JsonResponse({"success": False, "message": "Party name is required."})
                
                if not data.get("purchase_date"):
                    return JsonResponse({"success": False, "message": "Date name is required."})
                
                if not data.get("items"):
                    return JsonResponse({"success": False, "message": "Atlest one item is required to make a Purchase"})
                

                try:
                    # Validating Party name (skipped for cash purchase -> uses Cash party)
                    if not _is_cash_purchase:
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
                            exists = cursor.fetchone()

                            if not exists:
                                return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Invalid Party-Name"})

                # Validate purchase_date (must be in correct date format)
                try:
                    # Adjust format according to your input (e.g. "YYYY-MM-DD")
                    purchase_date = datetime.strptime(data.get("purchase_date"), "%Y-%m-%d").date()

                    # Future Date Restriction
                    if purchase_date > date.today():
                        return JsonResponse({"success": False, "message": "Purchase date cannot be in the future."})

                    # Making Date again Str
                    purchase_date = purchase_date.strftime("%Y-%m-%d")

                except (ValueError, TypeError):
                    return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
                # validate Items
                try: 
                    for item in data.get("items"):
                        item_name = item["item_name"]
                        qty = item["qty"]
                        unit_price = item["unit_price"]
                        serials = item["serials"]


                        # validating item name
                        try:
                            with connection.cursor() as cursor:
                                cursor.execute("SELECT 1 FROM Items WHERE UPPER(item_name) = %s",[item_name.upper()])
                                exists = cursor.fetchone()

                                if not exists:
                                    return JsonResponse({"success": False, "message": f"Item with '{item_name.upper()}' Not exists!"})
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Item-name"})

                        # validating quantity 
                        try:
                            qty = int(qty)
                            if qty <= 0:
                                return JsonResponse({"success": False, "message": "Invalid Quantity"})
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Quantity"})

                        # validating unit price
                        try:
                            unit_price = float(unit_price)
                            if unit_price <= 0:
                                return JsonResponse({"success": False, "message": "Invalid Price"})
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Price"})
                        

                        # # Validating Serials
                        # if not purchase_id:
                        #     try:
                        #         for serial in serials:

                        #             with connection.cursor() as cursor:
                        #                 cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])

                        #                 exists = cursor.fetchone()

                        #                 if exists:
                        #                     return JsonResponse({"success": False, "message": f"The Serial '{serial}' already exists in Stock!"})
                        #     except:
                        #         return JsonResponse({"success": False, "message": "Invalid Serial Number!"})
                        
                        # Validating Serials
                        if not purchase_id:
                            try:
                                for serial_obj in serials:
                                    # Handle both old format (string) and new format (object)
                                    if isinstance(serial_obj, dict):
                                        serial_number = serial_obj.get('serial', '').strip()
                                        serial_comment = (serial_obj.get('comment') or '').strip()
                                        
                                        # Validate comment length (optional, frontend also validates)
                                        if serial_comment and len(serial_comment) > 500:
                                            return JsonResponse({
                                                "success": False, 
                                                "message": f"Comment for serial '{serial_number}' is too long (max 500 characters)."
                                            })
                                    else:
                                        # Backward compatibility: old format was just serial string
                                        serial_number = serial_obj.strip() if isinstance(serial_obj, str) else str(serial_obj)
                                    
                                    # Check if serial already exists in stock
                                    with connection.cursor() as cursor:
                                        cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)", [serial_number])
                                        exists = cursor.fetchone()
                                        
                                        if exists:
                                            return JsonResponse({
                                                "success": False, 
                                                "message": f"The Serial '{serial_number}' already exists in Stock!"
                                            })
                            except Exception as e:
                                return JsonResponse({
                                    "success": False, 
                                    "message": "Invalid Serial Number!"
                                })
                        
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Unexpected Error Please try again!"})
                
                # Execute DB function
                if not purchase_id: # means new Purchase
                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Purchase"
                            })
                        
                        #  Access check for Create Purchase Right
                        if not request.user.has_perm("auth.create_purchase"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Create Purchase"
                            })
                        # Find the party id (cash purchase -> sentinel Cash party)
                        with connection.cursor() as cursor:
                            if (data.get("purchase_type") or "credit").lower() == "cash":
                                cursor.execute("SELECT get_cash_party_id('purchase')")
                                party_id = cursor.fetchone()[0]
                            else:
                                cursor.execute("""
                                    SELECT party_id 
                                    FROM Parties 
                                    WHERE party_name = %s
                                """, [data.get("party_name")])
                                result = cursor.fetchone()
                                if not result:
                                    return JsonResponse({"success": False, "message": f"Party '{data.get("party_name")}' not found in Parties."})
                                party_id = result[0]
                            
                            
                            # Prepare your purchase items data
                            items_data = []
                            for item in data.get("items"):
                                items_data.append(item)

                    
                            # Convert Python list → JSON string
                            items_json = json.dumps(items_data)

                            # Postgres function `create_purchase`
                            cursor.execute("""
                                SELECT create_purchase(%s, %s, %s::jsonb, %s);
                            """, [party_id, purchase_date, items_json, request.user.id])

                            # Fetch the returned invoice ID
                            invoice_id = cursor.fetchone()[0]
                            # Save the optional user description on the invoice
                            cursor.execute(
                                "UPDATE purchaseinvoices SET description=%s WHERE purchase_invoice_id=%s",
                                [(data.get("description") or "").strip() or None, invoice_id],
                            )
                            return JsonResponse({"success": True, "message": "Purchase Successfull"})
                    except Exception as e:
                        return JsonResponse({"success": False, "message": f"Failed to make Purchase, try again! {e}"})  
                else: # if purchase ID Exists Means we have to update
                    # Validating If any serial number is removed from updated invoice which is already sold or purchases Returned
                    try:
                        
                        
                        # Prepare your purchase items data
                        items_data = []
                        for item in data.get("items"):
                            items_data.append(item)

                
                        # Convert Python list → JSON string
                        items_json = json.dumps(items_data)
                        
                        
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT validate_purchase_update2(%s,%s)",[purchase_id,items_json])
                            result = cursor.fetchone()[0]
                            result = json.loads(result)
                            


                            if not result["is_valid"]:
                                
                                sold_serials = result.get("sold_serials", [])
                                returned_serials = result.get("returned_serials", [])

                                # Build detailed message lines
                                details = []
                                if sold_serials:
                                    details.append(f"• Sold Serials: {', '.join(sold_serials)}")
                                if returned_serials:
                                    details.append(f"• Returned Serials: {', '.join(returned_serials)}")

                                message = (
                                    "Update blocked: some serial numbers you are trying to remove "
                                    "have already been sold or returned to the vendor.\n\n"
                                    + "\n".join(details)
                                )

                                return JsonResponse({
                                    "success": False,
                                    "message": message
                                })
                    except Exception as e:
                        logger.exception('swallowed exception in %s', __name__)
                        return JsonResponse({"success": False, "message": "Update Failed Try Again!"})
                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Purchase"
                            })
                        
                        #  Access check for Update Purchase Right
                        if not request.user.has_perm("auth.update_purchase"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Purchase"
                            })
                        
                        with connection.cursor() as cursor:
                            cursor.execute("""
                                SELECT party_id 
                                FROM Parties 
                                WHERE party_name = %s
                            """, [data.get("party_name")])
                            result = cursor.fetchone()
                            if not result:
                                return JsonResponse({"success": False, "message": f"Party '{data.get("party_name")}' not found in Parties."})
                            party_id = result[0]
                            
                            
                            # Prepare your purchase items data
                            items_data = []
                            for item in data.get("items"):
                                items_data.append(item)

                    
                            # Convert Python list → JSON string
                            items_json = json.dumps(items_data)
                            
                            # Postgres function `update_purchase_invoice`
                            cursor.execute("""
                                SELECT update_purchase_invoice(%s, %s::jsonb, %s, %s, %s);
                            """, [purchase_id, items_json, data.get("party_name"), purchase_date, request.user.id])

                            # Fetch the returned invoice ID
                            invoice_id = cursor.fetchone()[0]
                            # Save the optional user description on the invoice
                            cursor.execute(
                                "UPDATE purchaseinvoices SET description=%s WHERE purchase_invoice_id=%s",
                                [(data.get("description") or "").strip() or None, purchase_id],
                            )
                            return JsonResponse({"success": True, "message": "Update Successfull"})

                    except Exception as e:
                        logger.exception('swallowed exception in %s', __name__)
                        return JsonResponse({"success": False, "message": "Failed to Update Purchase, try again!"})  

                    

            except Exception:
                return JsonResponse({"success": False, "message": "Invalid request data!"})

        if action == "delete":
            
            if not purchase_id:
                return JsonResponse({"success": False, "message": "Navigate to Purchase Invoice first!"})
            
            # Validating If any serial number is removed before deleting any invoice which is already sold or purchases Returned
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT validate_purchase_delete(%s)",[purchase_id])
                    result = cursor.fetchone()[0]
                    result = json.loads(result)
                            
                    if not result["is_valid"]:
                        sold_serials = result.get("sold_serials", [])
                        returned_serials = result.get("returned_serials", [])

                        # Build detailed message lines
                        details = []
                        if sold_serials:
                            details.append(f"• Sold Serials: {', '.join(sold_serials)}")
                        if returned_serials:
                            details.append(f"• Returned Serials: {', '.join(returned_serials)}")

                        message = (
                            "Delete blocked: some serial numbers you are trying to remove "
                            "have already been sold or returned to the vendor.\n\n"
                            + "\n".join(details)
                        )

                        return JsonResponse({
                            "success": False,
                            "message": message
                        })
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Failed to Delete Purchase, try again!"})  
            
            # Executing Delete
            try:
                if request.user.groups.filter(name="view_only_users").exists():
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Purchase"
                    })
                
                #  Access check for Delete Purchase Right
                if not request.user.has_perm("auth.delete_purchase"):
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Purchase"
                    })
                
                with connection.cursor() as cursor:
                    cursor.execute("SELECT delete_purchase(%s)",[purchase_id])
                    return JsonResponse({"success": True, "message": "Deleted Successfully"})
            except Exception:
                return JsonResponse({"success": False, "message": "Unable to delete this Purchase! Try Again.."})
    return render(request, "purchase_templates/purchasing_template.html")


@login_required
def get_purchase(request):
    action = request.GET.get("action")
    current_id = request.GET.get("current_id")
    try:
        if action == "previous":
            
            if not current_id:
                
                # getting and  previous purchase ID
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT get_last_purchase_id()")
                        last_purchase = cursor.fetchone()
                        
                        if not last_purchase or not last_purchase[0]:
                            return JsonResponse({"success": False, "message": "No Last Purchase!"})
                        
                        try:
                            last_purchase = last_purchase[0]
    
                            current_id = int(last_purchase) + 1
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Last Purchase data!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase!"})
    
            # Validating Current purchase ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "Invalid Previous Purchase ID!"})
            
            # Fetching Previous purchase data from DB
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_previous_purchase(%s)",[current_id])
                    result_data = cursor.fetchone()
                 
                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Previous Purchase Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase!"})
        elif action == "next":
            # Validating Current purchase ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Next Purchase Found"})
            
            # Fetching Next purchase data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_next_purchase(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Next Purchase Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase!"})
            
        elif action == "current": # If no action is provided means we have to fetch current purchase ID
            
            # Validating Current purchase ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Purchase Found"})
            
            # Fetching Next purchase data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_current_purchase(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Purchase Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase!"})
        else:
            pass
    except Exception as e:
        logger.exception('swallowed exception in %s', __name__)
        return JsonResponse({"success": False, "message": "Data base Error!"})
    
    # Sending to frontend
    try:
        
        return JsonResponse(result_data[0])
    except Exception:
        return JsonResponse({"success": False, "message": "Invalid purchase data format."})


@login_required
def get_purchase_summary(request):
    try:
        from_date_str = request.GET.get("from")
        to_date_str = request.GET.get("to")

        # if user want purchasing summary in specific dates
        if from_date_str or to_date_str:
            # Validating Dates (must be in correct date format)
            try:
                # Adjust format according to your input (e.g. "YYYY-MM-DD")
                from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
                to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()

                # Future Date Restriction
                if from_date > date.today() or to_date > date.today():
                    return JsonResponse({"success": False, "message": "Dates can't be in Future"})

                # Making Date again Str
                from_date = from_date.strftime("%Y-%m-%d")
                to_date = to_date.strftime("%Y-%m-%d")

            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
            
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_purchase_summary(%s, %s)",[from_date,to_date])
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Purchase Invoices found in the given date range!"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Unable fetch Purchase Invoices, Check your Internet Connection!"})
        # if no date is specified then fetch last 20 purchase invoice summary
        else:
            
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_purchase_summary()")
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Purchase Invoices found"})
            except Exception as e:
                
                return JsonResponse({"success": False, "message": "Unable fetch Purchase Invoices, Check your Internet Connection!"})
        
        # now sending to frontend

        try:
            return JsonResponse(result[0], safe=False)
        except Exception as e:
            
            return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

    except Exception:
        return JsonResponse({"success": False, "message": "Invalid purchase data format."})
    

# ---------------------------------------------------------------------------
# Serial validation endpoint for Purchase page
# POST /purchase/check-serials/
# Body: {"serials": ["S1","S2",...], "purchase_id": null_or_int}
#
# For each serial this checks:
#   1. Does a record exist at all in serial history?  → "ever_existed"
#   2. Is it currently in_stock?                      → "in_stock"
# This covers both:
#   • Serials already purchased & in stock  (in_stock = true)
#   • Serials that were purchased, sold, or returned (record exists but not in_stock)
# Only serials with NO record at all are clean for a new purchase.
# ---------------------------------------------------------------------------
@login_required
def purchase_serial_check(request):
    if not request.user.has_perm("auth.view_purchase"):
        return JsonResponse({"success": False, "message": "Permission denied."})
 
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "POST required."})
 
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "Invalid JSON."})
 
    serials   = payload.get("serials", [])
    purchase_id = payload.get("purchase_id")   # when editing an existing invoice
 
    if not isinstance(serials, list):
        return JsonResponse({"success": False, "message": "'serials' must be a list."})
 
    results = {}   # serial -> {status, label}
 
    # If we're editing an existing invoice, serials that are ALREADY on that
    # invoice are allowed (they belong to this purchase), so fetch them first.
    existing_invoice_serials = set()
    if purchase_id:
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT get_current_purchase(%s)", [int(purchase_id)]
                )
                row = cursor.fetchone()
            if row and row[0]:
                inv = row[0]
                if isinstance(inv, str):
                    import json as _j
                    inv = _j.loads(inv)
                for item in (inv.get("items") or []):
                    for s in (item.get("serials") or []):
                        if isinstance(s, dict):
                            existing_invoice_serials.add(s.get("serial", "").strip().upper())
                        elif isinstance(s, str):
                            existing_invoice_serials.add(s.strip().upper())
        except Exception:
            pass   # fall back gracefully — just won't whitelist existing serials
 
    for serial in serials:
        serial = str(serial).strip()
        if not serial:
            continue
 
        if serial.upper() in existing_invoice_serials:
            results[serial] = {"status": "ok", "label": ""}
            continue
 
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT in_stock FROM get_serial_number_details(%s)", [serial]
                )
                row = cursor.fetchone()
 
            if row is None:
                # No record at all — clean serial, fine for purchase
                results[serial] = {"status": "ok", "label": ""}
            elif row[0]:
                # Record exists AND in_stock = true  → already in inventory
                results[serial] = {
                    "status": "in_stock",
                    "label": "Already in stock"
                }
            else:
                # Record exists but not in_stock → was purchased before (sold/returned)
                results[serial] = {
                    "status": "ever_existed",
                    "label": "Previously in system"
                }
        except Exception:
            results[serial] = {"status": "error", "label": "Lookup failed"}
 
    return JsonResponse({"success": True, "results": results})