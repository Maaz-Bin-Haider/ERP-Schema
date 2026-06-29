# from django.shortcuts import render,redirect
# from django.db import connection,IntegrityError
# from django.contrib import messages
# from django.http import JsonResponse
# import json
# from django.contrib import messages
# from django.contrib.auth.decorators import login_required

# @login_required
# def create_new_party(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to Add New Parties!")
#         return redirect("home:home")
    
#     if request.method == 'POST':
#         party_name = request.POST.get('party_name')
#         party_type = request.POST.get('party_type')
#         contact_info = request.POST.get('contact_info')
#         address = request.POST.get('address')
#         opening_balance = request.POST.get('opening_balance')
#         balance_type = request.POST.get('balance_type')

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s", [party_name.upper()])
#             exists = cursor.fetchone()

#             if exists:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party with the name '{party_name}' already exists!"
#                 })

#             # Insert new party
#             party_details = {
#                 "party_name": party_name.upper(),
#                 "party_type": party_type,
#                 "contact_info": contact_info,
#                 "address": address,
#                 "opening_balance": int(opening_balance or 0),
#                 "balance_type": balance_type
#             }

#             json_data = json.dumps(party_details)

#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add Parties."
#                     })
                
#                 #  Access check for Create parties Right
#                 if not request.user.has_perm("auth.create_party"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add New Parties!"
#                     })

#                 cursor.execute("SELECT add_party_from_json(%s);", [json_data])
#                 return JsonResponse({
#                     "status": "success",
#                     "message": f"Party '{party_name}' created successfully!"
#                 })
#             except IntegrityError:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party '{party_name}' already exists!"
#                 })

#     return render(request, "parties_templates/add_new_party.html")


# def get_party_by_name(party_name:str):
#     with connection.cursor() as cursor:
#         cursor.execute("SELECT get_party_by_name(%s)",[party_name.upper()])
#         row = cursor.fetchone()
    
#     if row and row[0]:
#         data = json.loads(row[0])
#         return data
#     return None

# @login_required
# def auto_complete_party(request):
#     if 'term' in request.GET:
#         term = request.GET.get('term').upper()

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT party_name FROM Parties WHERE UPPER(party_name) LIKE %s LIMIT 10",[term + '%'])
#             rows = cursor.fetchall()
        
#         suggestions = [row[0] for row in rows]
        
#         return JsonResponse(suggestions, safe=False)
#     return JsonResponse([], safe=False)

# @login_required
# def update_party(request):
#     context = {}
#     if request.method == 'GET' and 'search_name' in request.GET:
#         search_name = request.GET.get('search_name')
#         party = get_party_by_name(party_name=search_name)

#         if party:
#             context['party'] = party
#         else:
#             context["not_found"] = True

        

#     if request.method == 'POST':
#         party_id = request.POST.get('party_id')
#         data = {
#             "party_name": request.POST.get('party_name').upper(),
#             "party_type": request.POST.get('party_type'),
#             "contact_info": request.POST.get('contact_info'),
#             "address": request.POST.get('address'),
#             "opening_balance": float(request.POST.get('opening_balance') or 0),
#             "balance_type": request.POST.get('balance_type')
#         }

#         if party_id:
#             data["party_id"] = int(party_id)
        
#         json_data = json.dumps(data)

#         with connection.cursor() as cursor:
#             if party_id:
                
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Update Parties."
#                         })
#                     if not request.user.has_perm("auth.update_party"):
#                         messages.error(request, "You do not have permission to Update Parties!")
#                         return redirect("home:home")
#                     cursor.execute("SELECT update_party_from_json(%s,%s)",[int(party_id),json_data])
#                     messages.success(request,f"Updated '{data['party_name']}' Sucessfully!")
#                 except Exception as e:
#                     messages.error(request, f"An Unexpected Error Occured! {e}")
#             else:
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Add Parties."
#                         })
#                     cursor.execute("SELECT add_party_from_json(%s);", [json_data])
#                     messages.success(request, f"Party '{data['party_name']}' created successfully!")
#                 except IntegrityError:
#                     messages.error(request, f"Party '{data['party_name']}' already exists!")


#     return render(request,"parties_templates/update_party.html",context)


# @login_required
# def parties_hub(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to view Parties!")
#         return redirect("home:home")
#     return render(request, "parties_templates/parties.html")



# from django.shortcuts import render,redirect
# from django.db import connection,IntegrityError
# from django.contrib import messages
# from django.http import JsonResponse
# import json
# from django.contrib import messages
# from django.contrib.auth.decorators import login_required

# @login_required
# def create_new_party(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to Add New Parties!")
#         return redirect("home:home")
    
#     if request.method == 'POST':
#         party_name = request.POST.get('party_name')
#         party_type = request.POST.get('party_type')
#         contact_info = request.POST.get('contact_info')
#         address = request.POST.get('address')
#         opening_balance = request.POST.get('opening_balance')
#         balance_type = request.POST.get('balance_type')

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s", [party_name.upper()])
#             exists = cursor.fetchone()

#             if exists:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party with the name '{party_name}' already exists!"
#                 })

#             # Insert new party
#             party_details = {
#                 "party_name": party_name.upper(),
#                 "party_type": party_type,
#                 "contact_info": contact_info,
#                 "address": address,
#                 "opening_balance": int(opening_balance or 0),
#                 "balance_type": balance_type,
#                 "created_by_id": request.user.id
#             }

#             json_data = json.dumps(party_details)

#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add Parties."
#                     })
                
#                 #  Access check for Create parties Right
#                 if not request.user.has_perm("auth.create_party"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add New Parties!"
#                     })

#                 cursor.execute("SELECT add_party_from_json(%s);", [json_data])
#                 return JsonResponse({
#                     "status": "success",
#                     "message": f"Party '{party_name}' created successfully!"
#                 })
#             except IntegrityError:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party '{party_name}' already exists!"
#                 })

#     return render(request, "parties_templates/add_new_party.html")


# def get_party_by_name(party_name:str):
#     with connection.cursor() as cursor:
#         cursor.execute("SELECT get_party_by_name(%s)",[party_name.upper()])
#         row = cursor.fetchone()
    
#     if row and row[0]:
#         data = json.loads(row[0])
#         return data
#     return None

# @login_required
# def auto_complete_party(request):
#     if 'term' in request.GET:
#         term = request.GET.get('term').upper()

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT party_name FROM Parties WHERE UPPER(party_name) LIKE %s ORDER BY CASE WHEN UPPER(party_name) LIKE %s THEN 0 ELSE 1 END, party_name LIMIT 10",['%' + term + '%', term + '%'])
#             rows = cursor.fetchall()
        
#         suggestions = [row[0] for row in rows]
        
#         return JsonResponse(suggestions, safe=False)
#     return JsonResponse([], safe=False)

# @login_required
# def update_party(request):
#     context = {}
#     if request.method == 'GET' and 'search_name' in request.GET:
#         search_name = request.GET.get('search_name')
#         party = get_party_by_name(party_name=search_name)

#         if party:
#             context['party'] = party
#         else:
#             context["not_found"] = True

        

#     if request.method == 'POST':
#         party_id = request.POST.get('party_id')
#         data = {
#             "party_name": request.POST.get('party_name').upper(),
#             "party_type": request.POST.get('party_type'),
#             "contact_info": request.POST.get('contact_info'),
#             "address": request.POST.get('address'),
#             "opening_balance": float(request.POST.get('opening_balance') or 0),
#             "balance_type": request.POST.get('balance_type')
#         }

#         if party_id:
#             data["party_id"] = int(party_id)
        
#         json_data = json.dumps(data)

#         with connection.cursor() as cursor:
#             if party_id:
                
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Update Parties."
#                         })
#                     if not request.user.has_perm("auth.update_party"):
#                         messages.error(request, "You do not have permission to Update Parties!")
#                         return redirect("home:home")
#                     cursor.execute("SELECT update_party_from_json(%s,%s)",[int(party_id),json_data])
#                     messages.success(request,f"Updated '{data['party_name']}' Sucessfully!")
#                 except Exception as e:
#                     messages.error(request, f"An Unexpected Error Occured! {e}")
#             else:
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Add Parties."
#                         })
#                     data["created_by_id"] = request.user.id 
#                     json_data_only_for_add = json.dumps(data)
#                     cursor.execute("SELECT add_party_from_json(%s);", [json_data_only_for_add])
#                     messages.success(request, f"Party '{data['party_name']}' created successfully!")
#                 except IntegrityError:
#                     messages.error(request, f"Party '{data['party_name']}' already exists!")


#     return render(request,"parties_templates/update_party.html",context)


# @login_required
# def parties_hub(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to view Parties!")
#         return redirect("home:home")
#     return render(request, "parties_templates/parties.html")


# from django.shortcuts import render,redirect
# from django.db import connection,IntegrityError
# from django.contrib import messages
# from django.http import JsonResponse
# import json
# from django.contrib import messages
# from django.contrib.auth.decorators import login_required

# @login_required
# def create_new_party(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to Add New Parties!")
#         return redirect("home:home")
    
#     if request.method == 'POST':
#         party_name = request.POST.get('party_name')
#         party_type = request.POST.get('party_type')
#         contact_info = request.POST.get('contact_info')
#         address = request.POST.get('address')
#         opening_balance = request.POST.get('opening_balance')
#         balance_type = request.POST.get('balance_type')

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s", [party_name.upper()])
#             exists = cursor.fetchone()

#             if exists:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party with the name '{party_name}' already exists!"
#                 })

#             # Insert new party
#             party_details = {
#                 "party_name": party_name.upper(),
#                 "party_type": party_type,
#                 "contact_info": contact_info,
#                 "address": address,
#                 "opening_balance": int(opening_balance or 0),
#                 "balance_type": balance_type
#             }

#             json_data = json.dumps(party_details)

#             try:
#                 if request.user.groups.filter(name="view_only_users").exists():
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add Parties."
#                     })
                
#                 #  Access check for Create parties Right
#                 if not request.user.has_perm("auth.create_party"):
#                     return JsonResponse({
#                         "status": "error",
#                         "message": "You do not have permission to Add New Parties!"
#                     })

#                 cursor.execute("SELECT add_party_from_json(%s);", [json_data])
#                 return JsonResponse({
#                     "status": "success",
#                     "message": f"Party '{party_name}' created successfully!"
#                 })
#             except IntegrityError:
#                 return JsonResponse({
#                     "status": "error",
#                     "message": f"Party '{party_name}' already exists!"
#                 })

#     return render(request, "parties_templates/add_new_party.html")


# def get_party_by_name(party_name:str):
#     with connection.cursor() as cursor:
#         cursor.execute("SELECT get_party_by_name(%s)",[party_name.upper()])
#         row = cursor.fetchone()
    
#     if row and row[0]:
#         data = json.loads(row[0])
#         return data
#     return None

# @login_required
# def auto_complete_party(request):
#     if 'term' in request.GET:
#         term = request.GET.get('term').upper()

#         with connection.cursor() as cursor:
#             cursor.execute("SELECT party_name FROM Parties WHERE UPPER(party_name) LIKE %s LIMIT 10",[term + '%'])
#             rows = cursor.fetchall()
        
#         suggestions = [row[0] for row in rows]
        
#         return JsonResponse(suggestions, safe=False)
#     return JsonResponse([], safe=False)

# @login_required
# def update_party(request):
#     context = {}
#     if request.method == 'GET' and 'search_name' in request.GET:
#         search_name = request.GET.get('search_name')
#         party = get_party_by_name(party_name=search_name)

#         if party:
#             context['party'] = party
#         else:
#             context["not_found"] = True

        

#     if request.method == 'POST':
#         party_id = request.POST.get('party_id')
#         data = {
#             "party_name": request.POST.get('party_name').upper(),
#             "party_type": request.POST.get('party_type'),
#             "contact_info": request.POST.get('contact_info'),
#             "address": request.POST.get('address'),
#             "opening_balance": float(request.POST.get('opening_balance') or 0),
#             "balance_type": request.POST.get('balance_type')
#         }

#         if party_id:
#             data["party_id"] = int(party_id)
        
#         json_data = json.dumps(data)

#         with connection.cursor() as cursor:
#             if party_id:
                
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Update Parties."
#                         })
#                     if not request.user.has_perm("auth.update_party"):
#                         messages.error(request, "You do not have permission to Update Parties!")
#                         return redirect("home:home")
#                     data["created_by_id"] = request.user.id
                    # json_data = json.dumps(data)
                    # cursor.execute("SELECT update_party_from_json(%s,%s)",[int(party_id),json_data])
#                     messages.success(request,f"Updated '{data['party_name']}' Sucessfully!")
#                 except Exception as e:
#                     messages.error(request, f"An Unexpected Error Occured! {e}")
#             else:
#                 try:
#                     if request.user.groups.filter(name="view_only_users").exists():
#                         return JsonResponse({
#                             "status": "error",
#                             "message": "You do not have permission to Add Parties."
#                         })
#                     cursor.execute("SELECT add_party_from_json(%s);", [json_data])
#                     messages.success(request, f"Party '{data['party_name']}' created successfully!")
#                 except IntegrityError:
#                     messages.error(request, f"Party '{data['party_name']}' already exists!")


#     return render(request,"parties_templates/update_party.html",context)


# @login_required
# def parties_hub(request):
#     if not request.user.has_perm("auth.view_party"):
#         messages.error(request, "You do not have permission to view Parties!")
#         return redirect("home:home")
#     return render(request, "parties_templates/parties.html")



from django.shortcuts import render,redirect
from django.db import connection,IntegrityError
from django.contrib import messages
from django.http import JsonResponse
import json
from django.contrib import messages
from django.contrib.auth.decorators import login_required

@login_required
def create_new_party(request):
    if not request.user.has_perm("auth.view_party"):
        messages.error(request, "You do not have permission to Add New Parties!")
        return redirect("home:home")
    
    if request.method == 'POST':
        party_name = request.POST.get('party_name')
        party_type = request.POST.get('party_type')
        contact_info = request.POST.get('contact_info')
        address = request.POST.get('address')
        opening_balance = request.POST.get('opening_balance')
        balance_type = request.POST.get('balance_type')

        # Validate required input before using it (prevents 500 on missing field).
        if not party_name or not party_name.strip():
            return JsonResponse({"status": "error", "message": "Party name is required."})
        party_name = party_name.strip()

        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM Parties WHERE UPPER(party_name) = %s", [party_name.upper()])
            exists = cursor.fetchone()

            if exists:
                return JsonResponse({
                    "status": "error",
                    "message": f"Party with the name '{party_name}' already exists!"
                })

            # Insert new party
            party_details = {
                "party_name": party_name.upper(),
                "party_type": party_type,
                "contact_info": contact_info,
                "address": address,
                "opening_balance": int(opening_balance or 0),
                "balance_type": balance_type
            }

            party_details["created_by_id"] = request.user.id
            json_data = json.dumps(party_details)

            try:
                if request.user.groups.filter(name="view_only_users").exists():
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Add Parties."
                    })
                
                #  Access check for Create parties Right
                if not request.user.has_perm("auth.create_party"):
                    return JsonResponse({
                        "status": "error",
                        "message": "You do not have permission to Add New Parties!"
                    })

                cursor.execute("SELECT add_party_from_json(%s);", [json_data])
                return JsonResponse({
                    "status": "success",
                    "message": f"Party '{party_name}' created successfully!"
                })
            except IntegrityError:
                return JsonResponse({
                    "status": "error",
                    "message": f"Party '{party_name}' already exists!"
                })

    return render(request, "parties_templates/add_new_party.html")


# def get_party_by_name(party_name:str):
#     with connection.cursor() as cursor:
#         cursor.execute("SELECT get_party_by_name(%s)",[party_name.upper()])
#         row = cursor.fetchone()
    
#     if row and row[0]:
#         data = json.loads(row[0])
#         return data
#     return None

def get_party_by_name(party_name:str):
    with connection.cursor() as cursor:
        cursor.execute("SELECT get_party_by_name(%s)",[party_name.upper()])
        row = cursor.fetchone()

    if row and row[0]:
        data = row[0] if isinstance(row[0], list) else json.loads(row[0])
        if isinstance(data, list) and len(data) > 0:
            return data[0]
    return None

@login_required
def auto_complete_party(request):
    if 'term' in request.GET:
        term = (request.GET.get('term') or '').upper()
        include_cash = request.GET.get('include_cash') == '1'

        with connection.cursor() as cursor:
            if include_cash:
                # Reports/ledger picker: cash sentinel accounts are selectable here
                cursor.execute("SELECT party_name FROM Parties WHERE UPPER(party_name) LIKE %s ORDER BY CASE WHEN UPPER(party_name) LIKE %s THEN 0 ELSE 1 END, party_name LIMIT 10",['%' + term + '%', term + '%'])
            else:
                cursor.execute("SELECT party_name FROM Parties WHERE UPPER(party_name) LIKE %s AND COALESCE(is_cash, false) = false ORDER BY CASE WHEN UPPER(party_name) LIKE %s THEN 0 ELSE 1 END, party_name LIMIT 10",['%' + term + '%', term + '%'])
            rows = cursor.fetchall()
        
        suggestions = [row[0] for row in rows]
        
        return JsonResponse(suggestions, safe=False)
    return JsonResponse([], safe=False)

@login_required
def update_party(request):
    context = {}

    # ──────────────────────────────────────────────────────────────────
    # AJAX branch (used by the Parties hub / single-page UI).
    # Only triggers for XMLHttpRequest calls so the standalone
    # update_party.html page keeps behaving exactly as before.
    # ──────────────────────────────────────────────────────────────────
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        # --- AJAX search: return the party as JSON ---
        if request.method == "GET" and "search_name" in request.GET:
            party = get_party_by_name(party_name=request.GET.get("search_name"))
            if party:
                return JsonResponse({"status": "found", "party": party})
            return JsonResponse({"status": "not_found"})

        # --- AJAX update: apply changes and return JSON ---
        if request.method == "POST":
            party_id = request.POST.get("party_id")
            if not party_id:
                return JsonResponse({
                    "status": "error",
                    "message": "No party selected to update. Please search and select a party first."
                })

            if request.user.groups.filter(name="view_only_users").exists():
                return JsonResponse({
                    "status": "error",
                    "message": "You do not have permission to Update Parties."
                })

            if not request.user.has_perm("auth.update_party"):
                return JsonResponse({
                    "status": "error",
                    "message": "You do not have permission to Update Parties!"
                })

            if not (request.POST.get("party_name") or "").strip():
                return JsonResponse({
                    "status": "error",
                    "message": "Party name is required."
                })

            data = {
                "party_name": (request.POST.get("party_name") or "").strip().upper(),
                "party_type": request.POST.get("party_type"),
                "contact_info": request.POST.get("contact_info"),
                "address": request.POST.get("address"),
                "opening_balance": float(request.POST.get("opening_balance") or 0),
                "balance_type": str(request.POST.get("balance_type")),
                "created_by_id": request.user.id,
            }
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT update_party_from_json(%s,%s)", [int(party_id), json.dumps(data)])
                return JsonResponse({
                    "status": "success",
                    "message": f"Party '{data['party_name']}' updated successfully!"
                })
            except Exception as e:
                return JsonResponse({
                    "status": "error",
                    "message": f"An unexpected error occurred! {e}"
                })

    # ──────────────────────────────────────────────────────────────────
    # Original (non-AJAX) standalone-page behaviour — unchanged.
    # ──────────────────────────────────────────────────────────────────
    if request.method == 'GET' and 'search_name' in request.GET:
        search_name = request.GET.get('search_name')
        party = get_party_by_name(party_name=search_name)

        if party:
            context['party'] = party
        else:
            context["not_found"] = True

        

    if request.method == 'POST':
        party_id = request.POST.get('party_id')
        if not (request.POST.get('party_name') or "").strip():
            messages.error(request, "Party name is required.")
            return render(request, "parties_templates/update_party.html", context)
        data = {
            "party_name": (request.POST.get('party_name') or "").strip().upper(),
            "party_type": request.POST.get('party_type'),
            "contact_info": request.POST.get('contact_info'),
            "address": request.POST.get('address'),
            "opening_balance": float(request.POST.get('opening_balance') or 0),
            "balance_type": str(request.POST.get('balance_type'))
        }

        if party_id:
            data["party_id"] = int(party_id)
        
        json_data = json.dumps(data)

        with connection.cursor() as cursor:
            if party_id:
                
                try:
                    if request.user.groups.filter(name="view_only_users").exists():
                        return JsonResponse({
                            "status": "error",
                            "message": "You do not have permission to Update Parties."
                        })
                    if not request.user.has_perm("auth.update_party"):
                        messages.error(request, "You do not have permission to Update Parties!")
                        return redirect("home:home")
                    data["created_by_id"] = request.user.id
                    json_data = json.dumps(data)
                    cursor.execute("SELECT update_party_from_json(%s,%s)",[int(party_id),json_data])
                    messages.success(request,f"Updated '{data['party_name']}' Sucessfully!")
                except Exception as e:
                    messages.error(request, f"An Unexpected Error Occured! {e}")
            else:
                try:
                    if request.user.groups.filter(name="view_only_users").exists():
                        return JsonResponse({
                            "status": "error",
                            "message": "You do not have permission to Add Parties."
                        })
                    data["created_by_id"] = request.user.id
                    json_data = json.dumps(data)
                    cursor.execute("SELECT add_party_from_json(%s);", [json_data])
                    messages.success(request, f"Party '{data['party_name']}' created successfully!")
                except IntegrityError:
                    messages.error(request, f"Party '{data['party_name']}' already exists!")


    return render(request,"parties_templates/update_party.html",context)


@login_required
def parties_hub(request):
    if not request.user.has_perm("auth.view_party"):
        messages.error(request, "You do not have permission to view Parties!")
        return redirect("home:home")
    return render(request, "parties_templates/parties.html")

@login_required
def parties_list_json(request):
    """
    Returns the full parties directory as JSON for the 'All Parties' table:
    name, type, contact, address, opening balance + type, who added/last-touched
    it, and the creation date.
    """
    if not request.user.has_perm("auth.view_party"):
        return JsonResponse({"status": "error", "message": "You do not have permission to view Parties!"}, status=403)

    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT p.party_id,
                   p.party_name,
                   p.party_type,
                   p.contact_info,
                   p.address,
                   p.opening_balance,
                   p.balance_type,
                   COALESCE(u.username, 'N/A') AS created_by,
                   p.date_created
            FROM Parties p
            LEFT JOIN auth_user u ON u.id = p.created_by
            ORDER BY p.date_created DESC NULLS LAST, p.party_id DESC
        """)
        rows = cursor.fetchall()

    def fmt(dt):
        return dt.strftime("%d %b %Y, %I:%M %p") if dt else ""

    parties = [{
        "party_id": r[0],
        "party_name": r[1],
        "party_type": r[2] or "",
        "contact_info": r[3] or "",
        "address": r[4] or "",
        "opening_balance": str(r[5]) if r[5] is not None else "0.00",
        "balance_type": r[6] or "",
        "created_by": r[7],
        "date_created": fmt(r[8]),
    } for r in rows]

    return JsonResponse({"status": "success", "count": len(parties), "parties": parties})
