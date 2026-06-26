from django.shortcuts import render,redirect
from django.http import JsonResponse
from django.contrib import messages
from django.db import connection
from datetime import datetime, date
import json
from django.contrib.auth.decorators import login_required

import logging
logger = logging.getLogger(__name__)

# Create your views here.

@login_required
def sales(request):
    if not request.user.has_perm("auth.view_sale"):
        messages.error(request, "You do not have permission to View Sale Invoices.")
        return redirect("home:home")
    
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            action = data.get("action")  
            sale_id = data.get("sale_id")
            if sale_id:
                sale_id = int(sale_id)
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Invalid JSON"})
        
        if action == "submit":
            
            try:
                data = json.loads(request.body)
                # validation example
                if not data.get("party_name"):
                    return JsonResponse({"success": False, "message": "Party name is required."})
                
                if not data.get("sale_date"):
                    return JsonResponse({"success": False, "message": "Date name is required."})
                
                if not data.get("items"):
                    return JsonResponse({"success": False, "message": "Atlest one item is required to make a Sale"})
                

                try:
                    # Validating Party name
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
                        exists = cursor.fetchone()

                        if not exists:
                            return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Invalid Party-Name"})

                # Validate sales_date (must be in correct date format)
                try:
                    # Adjust format according to your input (e.g. "YYYY-MM-DD")
                    sale_date = datetime.strptime(data.get("sale_date"), "%Y-%m-%d").date()

                    # Future Date Restriction
                    if sale_date > date.today():
                        return JsonResponse({"success": False, "message": "Sale date cannot be in the future."})

                    # Making Date again Str
                    sale_date = sale_date.strftime("%Y-%m-%d")

                except (ValueError, TypeError):
                    return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
                # Flag for confirmation check when price <= to buying price
                force = data.get("force", False)
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
                        
                        # TODO: Check the give Quantity if this exits in current stock

                        
                        

                        # Validating Serials
                        
                        try:
                            for serial in serials:

                                with connection.cursor() as cursor:
                                    cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])

                                    exists = cursor.fetchone()

                                    if not exists:
                                        return JsonResponse({"success": False, "message": f"The Serial '{serial}' not exists in Stock!"})
                                    
                                    if exists:
                                        cursor.execute("SELECT item_name FROM get_serial_number_details(%s)",[serial])
                                        original_item_name = cursor.fetchone()

                                        # For handling when provided dosen't belongs to the actual item name
                                        try:
                                            if not original_item_name[0] == item_name:
                                                return JsonResponse({"success":False,"message":f"The serial '{serial}' does not belong to {item_name}; it belongs to {original_item_name[0]}."})
                                        except Exception as e:
                                            logger.exception('swallowed exception in %s', __name__)
                                            return JsonResponse({"success": False, "message": "Invalid Serial Number!"})
                                        
                                        # validating unit price
                                        try:
                                            unit_price = float(unit_price)
                                            if unit_price <= 0:
                                                return JsonResponse({"success": False, "message": "Invalid Price"})
                                            
                                            cursor.execute("SELECT purchase_price FROM get_serial_number_details(%s)",[serial])
                                            buying_price = cursor.fetchone()

                                            try:
                                                if not force:
                                                    if unit_price == float(buying_price[0]):
                                                        return JsonResponse({
                                                            "success": False,
                                                            "confirm": True,
                                                            "message": "The selling price is equal to the buying price. Do you want to continue?"
                                                        })
                                                    elif unit_price < float(buying_price[0]):
                                                        return JsonResponse({
                                                            "success": False,
                                                            "confirm": True,
                                                            "message": "The selling price is less than the buying price. Do you want to continue?"
                                                        })
                                            except Exception as e:
                                                return JsonResponse({"success": False, "message": "Invalid price from database."})
                                            
                                        except Exception as e:
                                            logger.exception('swallowed exception in %s', __name__)
                                            return JsonResponse({"success": False, "message": "Invalid Price"})

                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Serial Number!"})
                        
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Unexpected Error Please try again!"})
                
                # Execute DB function
                if not sale_id: # means new Sale
                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Sale"
                            })
                        
                        #  Access check for Create Sale Right
                        if not request.user.has_perm("auth.create_sale"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Create Sale"
                            })
                        
                        # Find the vendor ID
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
                            
                            
                            # Prepare your sale items data
                            items_data = []
                            for item in data.get("items"):
                                items_data.append(item)

                    
                            # Convert Python list → JSON string
                            items_json = json.dumps(items_data)

                            # Postgres function `create_purchase`
                            cursor.execute("""
                                SELECT create_sale(%s, %s, %s::jsonb, %s);
                            """, [party_id, sale_date, items_json, request.user.id])

                            # Fetch the returned invoice ID
                            invoice_id = cursor.fetchone()[0]
                            # Save the optional user description on the invoice
                            cursor.execute(
                                "UPDATE salesinvoices SET description=%s WHERE sales_invoice_id=%s",
                                [(data.get("description") or "").strip() or None, invoice_id],
                            )
                            return JsonResponse({"success": True, "message": "Sale Successfull"})
                    except Exception as e:
                        logger.exception('swallowed exception in %s', __name__)
                        return JsonResponse({"success": False, "message": "Failed to make Sale, try again!"})  
                else: # if sale ID Exists Means we have to update
                    try:
                        # Prepare your sale items data
                        items_data = []
                        for item in data.get("items"):
                            items_data.append(item)

                
                        # Convert Python list → JSON string
                        items_json = json.dumps(items_data)

                        with connection.cursor() as cursor:
                            cursor.execute("SELECT validate_sales_update(%s,%s)",[sale_id,items_json])
                            result = cursor.fetchone()[0]
                            result = json.loads(result)
                            


                            if not result["is_valid"]:
                                returned_serials = result.get("returned_serials", [])

                                # Build detailed message lines
                                details = []
                                if returned_serials:
                                    details.append(f"• Returned Serials: {', '.join(returned_serials)}")

                                message = (
                                    "Update blocked: some serial numbers you are trying to remove "
                                    "have already been returned from Customer.\n\n"
                                    + "\n".join(details)
                                )

                                return JsonResponse({
                                    "success": False,
                                    "message": message
                                })
                    except Exception as e:
                        return JsonResponse({"success": False, "message": f"Unable to update sale: {e}"})

                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Sale"
                            })
                        
                        #  Access check for Update Sale Right
                        if not request.user.has_perm("auth.update_sale"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Sale"
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
                            
                            
                            # Prepare your sale items data
                            items_data = []
                            for item in data.get("items"):
                                items_data.append(item)

                    
                            # Convert Python list → JSON string
                            items_json = json.dumps(items_data)
                            

                            # Postgres function `update_purchase_invoice`
                            cursor.execute("""
                                SELECT update_sale_invoice(%s, %s::jsonb, %s, %s, %s);
                            """, [sale_id, items_json, data.get("party_name"), sale_date, request.user.id])

                            # Fetch the returned invoice ID
                            invoice_id = cursor.fetchone()[0]
                            # Save the optional user description on the invoice
                            cursor.execute(
                                "UPDATE salesinvoices SET description=%s WHERE sales_invoice_id=%s",
                                [(data.get("description") or "").strip() or None, sale_id],
                            )
                            return JsonResponse({"success": True, "message": "Update Successfull"})

                    except Exception as e:
                        logger.exception('swallowed exception in %s', __name__)
                        return JsonResponse({"success": False, "message": "Failed to Update Sale, try again!"})  

                    

            except Exception:
                return JsonResponse({"success": False, "message": "Invalid request data!"})

        if action == "delete":
            
            if not sale_id:
                return JsonResponse({"success": False, "message": "Navigate to Sale Invoice first!"})
            
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT validate_sales_delete(%s)",[sale_id])
                    result = cursor.fetchone()[0]
                    result = json.loads(result)
                            
                    if not result["is_valid"]:
                        returned_serials = result.get("returned_serials", [])

                        # Build detailed message lines
                        details = []
                        if returned_serials:
                            details.append(f"• Returned Serials: {', '.join(returned_serials)}")

                        message = (
                            "Delete blocked: some serial numbers you are trying to remove "
                            "have already been returned from the Customer.\n\n"
                            + "\n".join(details)
                        )

                        return JsonResponse({
                            "success": False,
                            "message": message
                        })
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Failed to Delete Sale, try again!"})
            
            # Executing Delete
            try:
                if request.user.groups.filter(name="view_only_users").exists():
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Sale"
                    })
                
                 #  Access check for Delete Sale Right
                if not request.user.has_perm("auth.delete_sale"):
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Sale"
                    })

                with connection.cursor() as cursor:
                    cursor.execute("SELECT delete_sale(%s)",[sale_id])
                    return JsonResponse({"success": True, "message": "Deleted Successfully"})
            except Exception:
                return JsonResponse({"success": False, "message": "Unable to delete this Sale! Try Again.."})
    return render(request, "sale_templates/sale_template.html")

@login_required
def get_sale(request):
    action = request.GET.get("action")
    current_id = request.GET.get("current_id")
    try:
        if action == "previous":
            if not current_id:
                # getting   previous sale ID
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT get_last_sale_id()")
                        last_sale = cursor.fetchone()
                        
                        if not last_sale or not last_sale[0]:
                            return JsonResponse({"success": False, "message": "No Last Sale!"})
                        
                        try:
                            last_sale = last_sale[0]
    
                            current_id = int(last_sale) + 1
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Last Sale data!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Sale!"})
    
            # Validating Current Sale ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "Invalid Previous Sale ID!"})
            
            # Fetching Previous Sale data from DB
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_previous_sale(%s)",[current_id])
                    result_data = cursor.fetchone()
                 
                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Previous Sale Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Sale!"})
        elif action == "next":
            # Validating Current sale ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Next Sale Found"})
            
            # Fetching Next sale data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_next_sale(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Next Sale Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Sale!"})
            
        elif action == "current": # If no action is provided means we have to fetch current Sale ID
            
            # Validating Current sale ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Sale Found"})
            
            # Fetching Next sale data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_current_sale(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Sale Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Sale!"})
        else:
            pass
    except Exception as e:
        logger.exception('swallowed exception in %s', __name__)
        return JsonResponse({"success": False, "message": "Data base Error!"})
    
    # Sending to frontend
    try:
        
        return JsonResponse(result_data[0])
    except Exception:
        return JsonResponse({"success": False, "message": "Invalid sale data format."})
    
# ---------------------------------------------------------------------------
# Serial-based item lookup for Sale
# ---------------------------------------------------------------------------
# Reusable backend helper.  Uses the existing DB function
# `get_serial_number_details(serial)` which already returns:
#   - in_stock        (bool)
#   - item_name       (text)
#   - purchase_price  (numeric)
#   - sold_price, customer_name, vendor_name, ...
# No schema change is needed.
def get_item_by_serial_for_sale(serial):
    """
    Fast, side-effect-free lookup used by the Sale workflow.

    Returns a dict:
        {
            "success": True,
            "serial":        "<normalized serial>",
            "item_name":     "...",
            "purchase_price": <float or None>,
        }
    or on failure:
        {"success": False, "message": "<reason>"}
    """
    if serial is None:
        return {"success": False, "message": "Serial number is required."}

    serial = str(serial).strip()
    if not serial:
        return {"success": False, "message": "Serial number is required."}

    try:
        with connection.cursor() as cursor:
            # Single query pulls everything we need — no N+1, no extra round-trips.
            cursor.execute(
                "SELECT in_stock, item_name, purchase_price "
                "FROM get_serial_number_details(%s)",
                [serial],
            )
            row = cursor.fetchone()
    except Exception:
        return {"success": False, "message": f"Invalid serial number '{serial}'."}

    if not row:
        return {"success": False, "message": f"Serial '{serial}' not found."}

    in_stock, item_name, purchase_price = row[0], row[1], row[2]

    if not in_stock:
        return {
            "success": False,
            "message": f"Serial '{serial}' is not in stock (already sold or never received).",
        }

    if not item_name:
        return {
            "success": False,
            "message": f"Serial '{serial}' has no linked item.",
        }

    try:
        purchase_price = float(purchase_price) if purchase_price is not None else None
    except (TypeError, ValueError):
        purchase_price = None

    return {
        "success": True,
        "serial": serial,
        "item_name": item_name,
        "purchase_price": purchase_price,
    }


@login_required
def sale_lookup_serial(request, serial: str):
    """
    AJAX endpoint: GET /sale/lookup/<serial>/
    Returns the item_name (and purchase_price) for a single serial so the
    frontend can auto-fill the item field.
    """
    if not request.user.has_perm("auth.view_sale"):
        return JsonResponse(
            {"success": False, "message": "You do not have permission to view sales."}
        )

    result = get_item_by_serial_for_sale(serial)
    return JsonResponse(result)


@login_required
def sale_bulk_serial_lookup(request):
    """
    AJAX endpoint: POST /sale/bulk-lookup/
    Body: {"raw": "<pasted text>"}  OR  {"serials": ["s1","s2",...]}

    Parses newline/comma/tab/semicolon-separated input, deduplicates it,
    looks each serial up via the existing DB function, and groups them by
    item so the frontend can render one sale row per distinct item.

    Response:
    {
      "success": true,
      "total_input": 12,
      "unique": 11,
      "groups": [
        {
          "item_name": "IPHONE 13",
          "purchase_price": 850.00,
          "serials": ["S1", "S2", ...]
        },
        ...
      ],
      "invalid": [
        {"serial": "BAD1", "reason": "Serial 'BAD1' not found."},
        ...
      ]
    }
    """
    if not request.user.has_perm("auth.view_sale"):
        return JsonResponse(
            {"success": False, "message": "You do not have permission to view sales."}
        )

    if request.method != "POST":
        return JsonResponse({"success": False, "message": "POST required."})

    # ---------- Parse payload ----------
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "Invalid JSON."})

    raw = payload.get("raw")
    serials_in = payload.get("serials")

    collected = []
    if raw is not None:
        if not isinstance(raw, str):
            return JsonResponse(
                {"success": False, "message": "Field 'raw' must be a string."}
            )
        # Split on any common separator: newline, tab, comma, semicolon, CR.
        # This is what lets users paste straight from Excel (tab/newline) or
        # CSV (comma).
        import re
        parts = re.split(r"[\r\n\t,;]+", raw)
        collected = [p.strip() for p in parts if p and p.strip()]
    elif isinstance(serials_in, list):
        collected = [str(s).strip() for s in serials_in if str(s).strip()]
    else:
        return JsonResponse(
            {
                "success": False,
                "message": "Provide 'raw' text or a 'serials' list.",
            }
        )

    if not collected:
        return JsonResponse(
            {"success": False, "message": "No serial numbers were provided."}
        )

    total_input = len(collected)

    # ---------- Deduplicate while preserving order ----------
    seen = set()
    unique_serials = []
    for s in collected:
        key = s.upper()
        if key in seen:
            continue
        seen.add(key)
        unique_serials.append(s)

    # ---------- Look each one up and group by item ----------
    groups_by_item = {}   # item_name -> {"item_name","purchase_price","serials":[...]}
    invalid = []

    for serial in unique_serials:
        result = get_item_by_serial_for_sale(serial)
        if not result.get("success"):
            invalid.append(
                {
                    "serial": serial,
                    "reason": result.get("message", "Lookup failed."),
                }
            )
            continue

        item_name = result["item_name"]
        group = groups_by_item.get(item_name)
        if group is None:
            group = {
                "item_name": item_name,
                "purchase_price": result.get("purchase_price"),
                "serials": [],
            }
            groups_by_item[item_name] = group
        group["serials"].append(result["serial"])

    groups = list(groups_by_item.values())

    return JsonResponse(
        {
            "success": True,
            "total_input": total_input,
            "unique": len(unique_serials),
            "groups": groups,
            "invalid": invalid,
        }
    )


@login_required
def get_sale_summary(request):
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
                    cursor.execute("SELECT get_sales_summary(%s, %s)",[from_date,to_date])
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Sale Invoices found in the given date range!"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Unable fetch Sale Invoices, Check your Internet Connection!"})
        # if no date is specified then fetch last 20 sale invoice summary
        else:
            
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_sales_summary()")
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Sale Invoices found"})
            except Exception as e:
                
                return JsonResponse({"success": False, "message": "Unable fetch Sale Invoices, Check your Internet Connection!"})
        
        # now sending to frontend

        try:
            return JsonResponse(result[0], safe=False)
        except Exception as e:
            
            return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

    except Exception:
        return JsonResponse({"success": False, "message": "Invalid sale data format."})