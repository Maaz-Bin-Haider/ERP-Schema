# from django.shortcuts import render,redirect

import logging
logger = logging.getLogger(__name__)
# from django.db import connection
# from django.http import JsonResponse
# import json
# from django.contrib import messages
# from datetime import datetime, date
# from django.contrib.auth.decorators import login_required

# # Create your views here.

# @login_required
# def createPurchaseReturn(request):
#     if not request.user.has_perm("auth.view_purchase_return"):
#         messages.error(request, "You do not have permission to View Purchase Return")
#         return redirect("home:home")
     
#     if request.method == "POST":
#         try:
#             data = json.loads(request.body)
#             action = data.get("action")
#             purchase_return_ID = data.get("return_id")
#             if purchase_return_ID:
#                 purchase_return_ID = int(purchase_return_ID)
#         except json.JSONDecodeError:
#             return JsonResponse({"success": False, "message": "Invalid JSON"})
        
#         # New or Update Purchase Return
#         if action == "submit":
            
#             # Validating provided data
#             try:
#                 # Validating Party name
#                 try:
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
#                         exists = cursor.fetchone()

#                         if not exists:
#                             return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Invalid Party-Name"})
                
#                 # Validate purchase_return_date (must be in correct date format)
#                 try:
#                     # Adjust format according to your input (e.g. "YYYY-MM-DD")
#                     purchase_return_date = datetime.strptime(data.get("return_date"), "%Y-%m-%d").date()

#                     # Future Date Restriction
#                     if purchase_return_date > date.today():
#                         return JsonResponse({"success": False, "message": "Purchase Return date cannot be in the future."})

#                     # Making Date again Str
#                     purchase_return_date = purchase_return_date.strftime("%Y-%m-%d")

#                 except (ValueError, TypeError):
#                     return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
#                 # Validate Serial Numbers
#                 try:
#                     for serial in data.get("serials"):
#                         # checking in Current Stock
#                         try:
#                             # Skipping when updating a purchase return invoice
#                             if purchase_return_ID:
#                                 with connection.cursor() as cursor:
#                                     cursor.execute("SELECT serial_exists_in_purchase_return(%s,%s)",[purchase_return_ID,serial])
#                                     exists = cursor.fetchone()

#                                     if exists:
#                                         continue

#                             with connection.cursor() as cursor:
#                                 cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
#                                 exists = cursor.fetchone()
#                                 if not exists[0]:
#                                     return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
                                
#                                 cursor.execute("SELECT vendor_name FROM get_serial_number_details(%s)",[serial])

#                                 # Validating provided party name for serial with actual party name  
#                                 vendor_name = cursor.fetchone()
#                                 if not vendor_name[0] == data.get("party_name"):
#                                     return JsonResponse({"success": False, "message": f"The serial number '{serial}' was purchased from {vendor_name}, not from {data.get('party_name')}."})
#                         except Exception as e:
#                             return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
#                 except:
#                     return JsonResponse({"success": False, "message": "Invalid Serial Data!"}) 
                

#                 if not purchase_return_ID:
#                     # Executing Create_purchase_ return function
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Purchase Return"
#                             })
                        
#                         #  Access check for Create Purchase Return Right
#                         if not request.user.has_perm("auth.create_purchase_return"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Create Purchase Return"
#                             })
                        
#                         json_data = json.dumps(data.get("serials"))
#                         with connection.cursor() as cursor:
#                             # cursor.execute("SELECT create_purchase_return(%s,%s)",[data.get('party_name'),json_data])
#                             cursor.execute("SELECT create_purchase_return(%s,%s,%s)",[data.get('party_name'),json_data,request.user.id])
#                         return JsonResponse({"success": True, "message": "Purchase Return Sucessfull"}) 
#                     except Exception as e:
#                         return JsonResponse({"success": False, "message": f"Unable to Purchase Return, Try Again!"}) 
#                 else:
#                     # Executing update_purchase_ return function
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase Return"
#                             })
                        
#                         #  Access check for Update Sale Right
#                         if not request.user.has_perm("auth.update_purchase_return"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase Return"
#                             })
                        
#                         json_data = json.dumps(data.get("serials"))
#                         with connection.cursor() as cursor:
#                             cursor.execute("SELECT update_purchase_return(%s,%s)",[purchase_return_ID,json_data])
#                         return JsonResponse({"success": True, "message": "Purchase-Return Updated Sucessfully"}) 
#                     except Exception as e:
                        
#                         return JsonResponse({"success": False, "message": f"Unable to Update Purchase-Return, Try Again! {e}"})
#             except:
#                 pass

#         # Delete Purchase Return
#         if action == "delete":
#             if not purchase_return_ID:
#                 return JsonResponse({ "success": False, "message":"Navigate to Return Invoice first" })
            
#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase Return"
#                     })
                
#                  #  Access check for Delete Purchase Return Right
#                 if not request.user.has_perm("auth.delete_purchase_return"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase Return"
#                     })

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT delete_purchase_return(%s)",[purchase_return_ID])
#                     return JsonResponse({"success": True, "message": "Deleted Successfully"})
#             except Exception:
#                 return JsonResponse({"success": False, "message": "Unable to delete this Purchase-Return! Try Again.."})


#     return render(request,'purchase_return_templates/purchase_return_template.html')

# @login_required
# def purchase_return_lookup(request,serial:str):

#     #validating Serial Number
#     try:
#         serial = str(serial)
#     except:
#         return JsonResponse({ "success": False, "message":"Invalid Serial Number" })
    
#     # checking in Current Stock
#     try:
#         with connection.cursor() as cursor:
#             cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
#             exists = cursor.fetchone()
#             if not exists[0]:
#                 return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
            
#             cursor.execute("SELECT item_name,purchase_price FROM get_serial_number_details(%s)",[serial])
#             item = cursor.fetchall()
            
#     except Exception as e:
#         return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
    
#     return JsonResponse({ "success": True, "item_name": item[0][0], "item_price": item[0][1]})
    
# @login_required
# def get_purchase_return(request):
#     action = request.GET.get("action")
#     current_id = request.GET.get("current_id")
#     try:
#         if action == "previous":
            
#             if not current_id:
                
#                 # getting and  previous purchase return ID
#                 try:
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT get_last_purchase_return_id()")
#                         last_purchase_return = cursor.fetchone()
                        
#                         if not last_purchase_return or not last_purchase_return[0]:
#                             return JsonResponse({"success": False, "message": "No Last Purchase Return!"})
                        
#                         try:
#                             last_purchase_return = last_purchase_return[0]
    
#                             current_id = int(last_purchase_return) + 1
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Last Purchase-Return data!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
    
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "Invalid Previous Purchase-Return ID!"})
            
#             # Fetching Previous purchase-return data from DB
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_previous_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()
                 
#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Previous Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
#         elif action == "next":
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
            
#             # Fetching Next purchase-return data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_next_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
            
#         elif action == "current": # If no action is provided means we have to fetch current purchase-return ID
            
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
            
#             # Fetching Next purchase-return data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_current_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
#         else:
#             pass
#     except:
#         return JsonResponse({"success": False, "message": "Data base Error!"})
    
#     # Sending to frontend
#     try:
        
#         return JsonResponse(result_data[0],safe=False)
#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})
    

# @login_required
# def get_purchase_return_summary(request):
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
#                     cursor.execute("SELECT get_purchase_return_summary(%s, %s)",[from_date,to_date])
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found in the given date range!"})
#             except:
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
#         # if no date is specified then fetch last 20 purchase invoice summary
#         else:
            
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_purchase_return_summary()")
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found"})
#             except Exception as e:
                
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
        
#         # now sending to frontend

#         try:
#             return JsonResponse(result[0], safe=False)
#         except Exception as e:
            
#             return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})


# from django.shortcuts import render,redirect
# from django.db import connection
# from django.http import JsonResponse
# import json
# from django.contrib import messages
# from datetime import datetime, date
# from django.contrib.auth.decorators import login_required

# # Create your views here.

# @login_required
# def createPurchaseReturn(request):
#     if not request.user.has_perm("auth.view_purchase_return"):
#         messages.error(request, "You do not have permission to View Purchase Return")
#         return redirect("home:home")
     
#     if request.method == "POST":
#         try:
#             data = json.loads(request.body)
#             action = data.get("action")
#             purchase_return_ID = data.get("return_id")
#             if purchase_return_ID:
#                 purchase_return_ID = int(purchase_return_ID)
#         except json.JSONDecodeError:
#             return JsonResponse({"success": False, "message": "Invalid JSON"})
        
#         # New or Update Purchase Return
#         if action == "submit":
            
#             # Validating provided data
#             try:
#                 # Validating Party name
#                 try:
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
#                         exists = cursor.fetchone()

#                         if not exists:
#                             return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Invalid Party-Name"})
                
#                 # Validate purchase_return_date (must be in correct date format)
#                 try:
#                     # Adjust format according to your input (e.g. "YYYY-MM-DD")
#                     purchase_return_date = datetime.strptime(data.get("return_date"), "%Y-%m-%d").date()

#                     # Future Date Restriction
#                     if purchase_return_date > date.today():
#                         return JsonResponse({"success": False, "message": "Purchase Return date cannot be in the future."})

#                     # Making Date again Str
#                     purchase_return_date = purchase_return_date.strftime("%Y-%m-%d")

#                 except (ValueError, TypeError):
#                     return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
#                 # Validate Serial Numbers
#                 try:
#                     for serial in data.get("serials"):
#                         # checking in Current Stock
#                         try:
#                             # Skipping when updating a purchase return invoice
#                             if purchase_return_ID:
#                                 with connection.cursor() as cursor:
#                                     cursor.execute("SELECT serial_exists_in_purchase_return(%s,%s)",[purchase_return_ID,serial])
#                                     exists = cursor.fetchone()

#                                     if exists:
#                                         continue

#                             with connection.cursor() as cursor:
#                                 cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
#                                 exists = cursor.fetchone()
#                                 if not exists[0]:
#                                     return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
                                
#                                 cursor.execute("SELECT vendor_name FROM get_serial_number_details(%s)",[serial])

#                                 # Validating provided party name for serial with actual party name  
#                                 vendor_name = cursor.fetchone()
#                                 if not vendor_name[0] == data.get("party_name"):
#                                     return JsonResponse({"success": False, "message": f"The serial number '{serial}' was purchased from {vendor_name}, not from {data.get('party_name')}."})
#                         except Exception as e:
#                             return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
#                 except:
#                     return JsonResponse({"success": False, "message": "Invalid Serial Data!"}) 
                

#                 if not purchase_return_ID:
#                     # Executing Create_purchase_ return function
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Purchase Return"
#                             })
                        
#                         #  Access check for Create Purchase Return Right
#                         if not request.user.has_perm("auth.create_purchase_return"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Create Purchase Return"
#                             })
                        
#                         json_data = json.dumps(data.get("serials"))
#                         with connection.cursor() as cursor:
#                             cursor.execute("SELECT create_purchase_return(%s,%s,%s)",[data.get('party_name'),json_data,request.user.id])
#                         return JsonResponse({"success": True, "message": "Purchase Return Sucessfull"}) 
#                     except Exception as e:
#                         return JsonResponse({"success": False, "message": f"Unable to Purchase Return, Try Again!"}) 
#                 else:
#                     # Executing update_purchase_ return function
#                     try:
#                         if request.user.groups.filter(name="view_only_users").exists():
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase Return"
#                             })
                        
#                         #  Access check for Update Sale Right
#                         if not request.user.has_perm("auth.update_purchase_return"):
#                             return JsonResponse({
#                                 "status": "error",
#                                 "message": "You do not have permission to Update Purchase Return"
#                             })
                        
#                         json_data = json.dumps(data.get("serials"))
#                         with connection.cursor() as cursor:
#                             cursor.execute("SELECT update_purchase_return(%s,%s)",[purchase_return_ID,json_data])
#                         return JsonResponse({"success": True, "message": "Purchase-Return Updated Sucessfully"}) 
#                     except Exception as e:
                        
#                         return JsonResponse({"success": False, "message": f"Unable to Update Purchase-Return, Try Again! {e}"})
#             except:
#                 pass

#         # Delete Purchase Return
#         if action == "delete":
#             if not purchase_return_ID:
#                 return JsonResponse({ "success": False, "message":"Navigate to Return Invoice first" })
            
#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase Return"
#                     })
                
#                  #  Access check for Delete Purchase Return Right
#                 if not request.user.has_perm("auth.delete_purchase_return"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Delete Purchase Return"
#                     })

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT delete_purchase_return(%s)",[purchase_return_ID])
#                     return JsonResponse({"success": True, "message": "Deleted Successfully"})
#             except Exception:
#                 return JsonResponse({"success": False, "message": "Unable to delete this Purchase-Return! Try Again.."})


#     return render(request,'purchase_return_templates/purchase_return_template.html')

# @login_required
# def purchase_return_lookup(request,serial:str):

#     #validating Serial Number
#     try:
#         serial = str(serial)
#     except:
#         return JsonResponse({ "success": False, "message":"Invalid Serial Number" })
    
#     # checking in Current Stock
#     try:
#         with connection.cursor() as cursor:
#             cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
#             exists = cursor.fetchone()
#             if not exists[0]:
#                 return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
            
#             cursor.execute("SELECT item_name,purchase_price FROM get_serial_number_details(%s)",[serial])
#             item = cursor.fetchall()
            
#     except Exception as e:
#         return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
    
#     return JsonResponse({ "success": True, "item_name": item[0][0], "item_price": item[0][1]})
    
# @login_required
# def get_purchase_return(request):
#     action = request.GET.get("action")
#     current_id = request.GET.get("current_id")
#     try:
#         if action == "previous":
            
#             if not current_id:
                
#                 # getting and  previous purchase return ID
#                 try:
#                     with connection.cursor() as cursor:
#                         cursor.execute("SELECT get_last_purchase_return_id()")
#                         last_purchase_return = cursor.fetchone()
                        
#                         if not last_purchase_return or not last_purchase_return[0]:
#                             return JsonResponse({"success": False, "message": "No Last Purchase Return!"})
                        
#                         try:
#                             last_purchase_return = last_purchase_return[0]
    
#                             current_id = int(last_purchase_return) + 1
#                         except:
#                             return JsonResponse({"success": False, "message": "Invalid Last Purchase-Return data!"})
#                 except:
#                     return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
    
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "Invalid Previous Purchase-Return ID!"})
            
#             # Fetching Previous purchase-return data from DB
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_previous_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()
                 
#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Previous Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
#         elif action == "next":
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
            
#             # Fetching Next purchase-return data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_next_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
            
#         elif action == "current": # If no action is provided means we have to fetch current purchase-return ID
            
#             # Validating Current purchase-return ID
#             try:
#                 current_id = int(current_id)
#             except (ValueError, TypeError):
#                 return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
            
#             # Fetching Next purchase-return data from DB
#             try:

#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_current_purchase_return(%s)",[current_id])
#                     result_data = cursor.fetchone()

#                 if not result_data or not result_data[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
#             except:
#                 return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
#         else:
#             pass
#     except:
#         return JsonResponse({"success": False, "message": "Data base Error!"})
    
#     # Sending to frontend
#     try:
        
#         return JsonResponse(result_data[0],safe=False)
#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})
    

# @login_required
# def get_purchase_return_summary(request):
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
#                     cursor.execute("SELECT get_purchase_return_summary(%s, %s)",[from_date,to_date])
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found in the given date range!"})
#             except:
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
#         # if no date is specified then fetch last 20 purchase invoice summary
#         else:
            
#             try:
#                 with connection.cursor() as cursor:
#                     cursor.execute("SELECT get_purchase_return_summary()")
#                     result = cursor.fetchone()
                
#                 if not result or not result[0]:
#                     return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found"})
#             except Exception as e:
                
#                 return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
        
#         # now sending to frontend

#         try:
#             return JsonResponse(result[0], safe=False)
#         except Exception as e:
            
#             return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

#     except Exception:
#         return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})


from django.shortcuts import render,redirect
from django.db import connection
from django.http import JsonResponse
import json
from django.contrib import messages
from datetime import datetime, date
from django.contrib.auth.decorators import login_required

# Create your views here.

@login_required
def createPurchaseReturn(request):
    if not request.user.has_perm("auth.view_purchase_return"):
        messages.error(request, "You do not have permission to View Purchase Return")
        return redirect("home:home")
     
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            action = data.get("action")
            purchase_return_ID = data.get("return_id")
            if purchase_return_ID:
                purchase_return_ID = int(purchase_return_ID)
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Invalid JSON"})
        
        # New or Update Purchase Return
        if action == "submit":
            
            # Validating provided data
            try:
                # Validating Party name
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s",[data.get("party_name").upper()])
                        exists = cursor.fetchone()

                        if not exists:
                            return JsonResponse({"success": False, "message": f"Party with '{data.get("party_name")}' Not exists!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Invalid Party-Name"})
                
                # Validate purchase_return_date (must be in correct date format)
                try:
                    # Adjust format according to your input (e.g. "YYYY-MM-DD")
                    purchase_return_date = datetime.strptime(data.get("return_date"), "%Y-%m-%d").date()

                    # Future Date Restriction
                    if purchase_return_date > date.today():
                        return JsonResponse({"success": False, "message": "Purchase Return date cannot be in the future."})

                    # Making Date again Str
                    purchase_return_date = purchase_return_date.strftime("%Y-%m-%d")

                except (ValueError, TypeError):
                    return JsonResponse({"success": False, "message": "Invalid date. Please enter a valid date in YYYY-MM-DD format."})
                
                # Validate Serial Numbers
                try:
                    for serial in data.get("serials"):
                        # checking in Current Stock
                        try:
                            # Skipping when updating a purchase return invoice
                            if purchase_return_ID:
                                with connection.cursor() as cursor:
                                    cursor.execute("SELECT serial_exists_in_purchase_return(%s,%s)",[purchase_return_ID,serial])
                                    exists = cursor.fetchone()

                                    if exists:
                                        continue

                            with connection.cursor() as cursor:
                                cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
                                exists = cursor.fetchone()
                                if not exists[0]:
                                    return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
                                
                                cursor.execute("SELECT vendor_name FROM get_serial_number_details(%s)",[serial])

                                # Validating provided party name for serial with actual party name  
                                vendor_name = cursor.fetchone()
                                if not vendor_name[0] == data.get("party_name"):
                                    return JsonResponse({"success": False, "message": f"The serial number '{serial}' was purchased from {vendor_name}, not from {data.get('party_name')}."})
                        except Exception as e:
                            return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Invalid Serial Data!"}) 
                

                if not purchase_return_ID:
                    # Executing Create_purchase_ return function
                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Purchase Return"
                            })
                        
                        #  Access check for Create Purchase Return Right
                        if not request.user.has_perm("auth.create_purchase_return"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Create Purchase Return"
                            })
                        
                        json_data = json.dumps(data.get("serials"))
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT create_purchase_return(%s,%s,%s)",[data.get('party_name'),json_data,request.user.id])
                            new_return_id = cursor.fetchone()[0]
                            cursor.execute(
                                "UPDATE purchasereturns SET description=%s WHERE purchase_return_id=%s",
                                [(data.get("description") or "").strip() or None, new_return_id],
                            )
                        return JsonResponse({"success": True, "message": "Purchase Return Sucessfull"}) 
                    except Exception as e:
                        return JsonResponse({"success": False, "message": f"Unable to Purchase Return, Try Again!"}) 
                else:
                    # Executing update_purchase_ return function
                    try:
                        if request.user.groups.filter(name="view_only_users").exists():
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Purchase Return"
                            })
                        
                        #  Access check for Update Sale Right
                        if not request.user.has_perm("auth.update_purchase_return"):
                            return JsonResponse({
                                "status": "error",
                                "message": "You do not have permission to Update Purchase Return"
                            })
                        
                        json_data = json.dumps(data.get("serials"))
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT update_purchase_return(%s,%s,%s)",[purchase_return_ID,json_data,request.user.id])
                            cursor.execute(
                                "UPDATE purchasereturns SET description=%s WHERE purchase_return_id=%s",
                                [(data.get("description") or "").strip() or None, purchase_return_ID],
                            )
                        return JsonResponse({"success": True, "message": "Purchase-Return Updated Sucessfully"}) 
                    except Exception as e:
                        
                        return JsonResponse({"success": False, "message": f"Unable to Update Purchase-Return, Try Again! {e}"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                pass

        # Delete Purchase Return
        if action == "delete":
            if not purchase_return_ID:
                return JsonResponse({ "success": False, "message":"Navigate to Return Invoice first" })
            
            try:
                if request.user.groups.filter(name="view_only_users").exists():
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Purchase Return"
                    })
                
                 #  Access check for Delete Purchase Return Right
                if not request.user.has_perm("auth.delete_purchase_return"):
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Delete Purchase Return"
                    })

                with connection.cursor() as cursor:
                    cursor.execute("SELECT delete_purchase_return(%s)",[purchase_return_ID])
                    return JsonResponse({"success": True, "message": "Deleted Successfully"})
            except Exception:
                return JsonResponse({"success": False, "message": "Unable to delete this Purchase-Return! Try Again.."})


    return render(request,'purchase_return_templates/purchase_return_template.html')

@login_required
def purchase_return_lookup(request,serial:str):

    #validating Serial Number
    try:
        serial = str(serial)
    except Exception as e:
        logger.exception('swallowed exception in %s', __name__)
        return JsonResponse({ "success": False, "message":"Invalid Serial Number" })
    
    # checking in Current Stock
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT in_stock FROM get_serial_number_details(%s)",[serial])
            exists = cursor.fetchone()
            if not exists[0]:
                return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
            
            cursor.execute("SELECT item_name,purchase_price FROM get_serial_number_details(%s)",[serial])
            item = cursor.fetchall()
            
    except Exception as e:
        return JsonResponse({ "success": False, "message":f"The Serial '{serial}' does not exists in stock!" })
    
    return JsonResponse({ "success": True, "item_name": item[0][0], "item_price": item[0][1]})
    
@login_required
def get_purchase_return(request):
    action = request.GET.get("action")
    current_id = request.GET.get("current_id")
    try:
        if action == "previous":
            
            if not current_id:
                
                # getting and  previous purchase return ID
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT get_last_purchase_return_id()")
                        last_purchase_return = cursor.fetchone()
                        
                        if not last_purchase_return or not last_purchase_return[0]:
                            return JsonResponse({"success": False, "message": "No Last Purchase Return!"})
                        
                        try:
                            last_purchase_return = last_purchase_return[0]
    
                            current_id = int(last_purchase_return) + 1
                        except Exception as e:
                            logger.exception('swallowed exception in %s', __name__)
                            return JsonResponse({"success": False, "message": "Invalid Last Purchase-Return data!"})
                except Exception as e:
                    logger.exception('swallowed exception in %s', __name__)
                    return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
    
            # Validating Current purchase-return ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "Invalid Previous Purchase-Return ID!"})
            
            # Fetching Previous purchase-return data from DB
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_previous_purchase_return(%s)",[current_id])
                    result_data = cursor.fetchone()
                 
                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Previous Purchase-Return Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Previous Purchase-Return!"})
        elif action == "next":
            # Validating Current purchase-return ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
            
            # Fetching Next purchase-return data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_next_purchase_return(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Next Purchase-Return Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
            
        elif action == "current": # If no action is provided means we have to fetch current purchase-return ID
            
            # Validating Current purchase-return ID
            try:
                current_id = int(current_id)
            except (ValueError, TypeError):
                return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
            
            # Fetching Next purchase-return data from DB
            try:

                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_current_purchase_return(%s)",[current_id])
                    result_data = cursor.fetchone()

                if not result_data or not result_data[0]:
                    return JsonResponse({"success": False, "message": "No Purchase-Return Found"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Data base Connection Error While getting Next Purchase-Return!"})
        else:
            pass
    except Exception as e:
        logger.exception('swallowed exception in %s', __name__)
        return JsonResponse({"success": False, "message": "Data base Error!"})
    
    # Sending to frontend
    try:
        
        return JsonResponse(result_data[0],safe=False)
    except Exception:
        return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})
    

@login_required
def get_purchase_return_summary(request):
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
                    cursor.execute("SELECT get_purchase_return_summary(%s, %s)",[from_date,to_date])
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found in the given date range!"})
            except Exception as e:
                logger.exception('swallowed exception in %s', __name__)
                return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
        # if no date is specified then fetch last 20 purchase invoice summary
        else:
            
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT get_purchase_return_summary()")
                    result = cursor.fetchone()
                
                if not result or not result[0]:
                    return JsonResponse({"success": False, "message": "No Purchase-Return Invoices found"})
            except Exception as e:
                
                return JsonResponse({"success": False, "message": "Unable fetch Purchase-Return Invoices, Check your Internet Connection!"})
        
        # now sending to frontend

        try:
            return JsonResponse(result[0], safe=False)
        except Exception as e:
            
            return JsonResponse({"success": False, "message": "Unexpected Error Occured, Please Try again!"})
        

    except Exception:
        return JsonResponse({"success": False, "message": "Invalid purchase-return data format."})