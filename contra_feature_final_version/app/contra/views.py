from django.shortcuts import render, redirect
from django.db import connection, DatabaseError, IntegrityError
from django.contrib import messages
from datetime import datetime, date
from django.http import JsonResponse
import json
from psycopg2.extras import Json
from django.contrib.auth.decorators import login_required


@login_required
def make_contra(request):
    if not request.user.has_perm("auth.view_contra_entry"):
        messages.error(request, "You do not have permission to view contra entries.")
        return redirect("home:home")

    if request.method == "POST":
        action = request.POST.get("action")
        contra_id = request.POST.get("current_id")

        if action == "submit":
            contra_date_str = request.POST.get("contra_date")
            from_name = (request.POST.get("from_search_name") or "").strip()
            to_name = (request.POST.get("to_search_name") or "").strip()
            amount_str = request.POST.get("amount")
            description = request.POST.get("description")

            ctx = {
                "from_party_name": from_name.upper(),
                "to_party_name": to_name.upper(),
                "amount": amount_str,
                "description": description or "",
                "contra_date": contra_date_str,
            }

            if not from_name or not to_name:
                messages.error(request, "Please choose both a From and a To party.")
                return render(request, "contra_templates/contra.html", ctx)

            if from_name.upper() == to_name.upper():
                messages.error(request, "From and To party cannot be the same.")
                return render(request, "contra_templates/contra.html", ctx)

            try:
                amount = float(amount_str)
                if amount <= 0:
                    messages.error(request, "Amount must be greater than Zero.")
                    return render(request, "contra_templates/contra.html", ctx)
            except (TypeError, ValueError):
                messages.error(request, "Invalid amount. Please enter a valid number.")
                return render(request, "contra_templates/contra.html", ctx)

            try:
                contra_date = datetime.strptime(contra_date_str, "%Y-%m-%d").date()
                if contra_date > date.today():
                    messages.error(request, "Date cannot be in the future.")
                    return render(request, "contra_templates/contra.html", ctx)
                contra_date = contra_date.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                messages.error(request, "Invalid date. Please use YYYY-MM-DD format.")
                return render(request, "contra_templates/contra.html", ctx)

            # both parties must exist
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT UPPER(party_name) FROM Parties WHERE UPPER(party_name) IN (%s, %s)",
                    [from_name.upper(), to_name.upper()],
                )
                found = {r[0] for r in cursor.fetchall()}
                if from_name.upper() not in found:
                    messages.error(request, f"No such party exists with name '{from_name}'!")
                    return render(request, "contra_templates/contra.html", ctx)
                if to_name.upper() not in found:
                    messages.error(request, f"No such party exists with name '{to_name}'!")
                    return render(request, "contra_templates/contra.html", ctx)

                payload = json.dumps({
                    "from_party_name": from_name.upper(),
                    "to_party_name": to_name.upper(),
                    "amount": amount,
                    "description": description or "",
                    "contra_date": contra_date,
                    "created_by_id": request.user.id,
                })

                if request.user.groups.filter(name="view_only_users").exists():
                    messages.error(request, "You do not have permission to make or update contra entries.")
                    return redirect("contra:contra")

                if not contra_id:  # new
                    if not request.user.has_perm("auth.create_contra_entry"):
                        messages.error(request, "You do not have permission to create contra entries.")
                        return redirect("contra:contra")
                    try:
                        cursor.execute("SELECT make_contra(%s)", [payload])
                        messages.success(request, f"Transfer recorded: {amount} from {from_name} to {to_name}.")
                        return redirect("contra:contra")
                    except Exception as e:
                        messages.error(request, f"An unexpected error occurred. {e}")
                else:  # update
                    if not request.user.has_perm("auth.update_contra_entry"):
                        messages.error(request, "You do not have permission to update contra entries.")
                        return redirect("contra:contra")
                    try:
                        cursor.execute("SELECT update_contra(%s, %s)", [contra_id, payload])
                        messages.success(request, f"Transfer updated: {amount} from {from_name} to {to_name}.")
                        return redirect("contra:contra")
                    except Exception as e:
                        messages.error(request, f"An unexpected error occurred. {e}")

        if action == "delete":
            if not contra_id:
                messages.error(request, "Navigate to a contra entry first to delete it.")
                return render(request, "contra_templates/contra.html")
            try:
                contra_id = int(contra_id)
            except (TypeError, ValueError):
                messages.error(request, "Navigate to a contra entry first to delete it.")
                return render(request, "contra_templates/contra.html")

            if request.user.groups.filter(name="view_only_users").exists():
                messages.error(request, "You do not have permission to delete contra entries.")
                return redirect("contra:contra")
            if not request.user.has_perm("auth.delete_contra_entry"):
                messages.error(request, "You do not have permission to delete contra entries.")
                return redirect("contra:contra")
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT delete_contra(%s)", [contra_id])
                messages.success(request, "Contra entry deleted successfully.")
                return redirect("contra:contra")
            except Exception:
                messages.error(request, "Unable to delete this contra entry! Try again.")
                return render(request, "contra_templates/contra.html")

    return render(request, "contra_templates/contra.html")


@login_required
def get_contra(request):
    action = request.GET.get("action")
    current_id = request.GET.get("current_id")
    try:
        with connection.cursor() as cursor:
            if action == "previous":
                if not current_id:
                    cursor.execute("SELECT get_last_contra()")
                    last = cursor.fetchone()
                    if not last or not last[0]:
                        return JsonResponse({"error": "No contra entries found."}, status=404)
                    try:
                        last = json.loads(last[0]) if isinstance(last[0], str) else last[0]
                        current_id = int(last["contra_id"]) + 1
                    except Exception:
                        return JsonResponse({"error": "Invalid last contra data"}, status=500)
                try:
                    current_id = int(current_id)
                except (ValueError, TypeError):
                    return JsonResponse({"error": "Invalid current_id."}, status=400)
                cursor.execute("SELECT get_previous_contra(%s)", [current_id])
                result = cursor.fetchone()
                if not result or not result[0]:
                    return JsonResponse({"error": "No previous contra found.", "info": "You are at the first record."}, status=404)
            elif action == "next":
                try:
                    current_id = int(current_id)
                except (ValueError, TypeError):
                    return JsonResponse({"error": "Invalid current_id."}, status=400)
                cursor.execute("SELECT get_next_contra(%s)", [current_id])
                result = cursor.fetchone()
                if not result or not result[0]:
                    return JsonResponse({"error": "No next contra found.", "info": "You are at the latest record."}, status=404)
            else:
                try:
                    current_id = int(current_id)
                except (ValueError, TypeError):
                    return JsonResponse({"error": "Invalid current_id."}, status=400)
                cursor.execute("SELECT get_contra_details(%s)", [current_id])
                result = cursor.fetchone()
                if not result or not result[0]:
                    return JsonResponse({"error": "No contra found."}, status=404)
    except DatabaseError:
        return JsonResponse({"error": "Database error."}, status=500)

    try:
        data = json.loads(result[0]) if isinstance(result[0], str) else result[0]
        return JsonResponse(data)
    except Exception:
        return JsonResponse({"error": "Invalid contra data format."}, status=500)


@login_required
def get_old_contras(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT get_last_20_contras_json(%s)", [Json({})])
            data = cursor.fetchone()
        if not data or not data[0]:
            return JsonResponse([], safe=False)
        data = json.loads(data[0]) if isinstance(data[0], str) else data[0]
        return JsonResponse(data, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
def get_contras_date_wise(request):
    try:
        from_date_str = request.GET.get("from")
        to_date_str = request.GET.get("to")
        if not from_date_str or not to_date_str:
            return JsonResponse({"error": "Missing date range"}, status=400)
        try:
            from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()
            if from_date > date.today() or to_date > date.today():
                return JsonResponse({"error": "Dates can't be in the future"}, status=400)
        except (ValueError, TypeError):
            return JsonResponse({"error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

        dates = {"start_date": from_date_str, "end_date": to_date_str}
        with connection.cursor() as cursor:
            cursor.execute("SELECT get_contras_by_date_json(%s)", [json.dumps(dates)])
            data = cursor.fetchone()
        if not data or not data[0]:
            return JsonResponse([], safe=False)
        data = json.loads(data[0]) if isinstance(data[0], str) else data[0]
        return JsonResponse(data, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
def get_party_balance(request):
    party_name = request.GET.get("name", "").strip()
    if not party_name:
        return JsonResponse({"error": "Party name is required."}, status=400)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT get_party_balance_by_name(%s)", [party_name])
            row = cursor.fetchone()
        if not row or row[0] is None:
            return JsonResponse({"found": False, "party_name": party_name})
        data = json.loads(row[0]) if isinstance(row[0], str) else row[0]
        return JsonResponse(data)
    except DatabaseError as e:
        return JsonResponse({"error": "Database error.", "details": str(e)}, status=500)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
