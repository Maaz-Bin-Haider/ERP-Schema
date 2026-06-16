import json
from django.shortcuts import render, redirect
from django.db import connection
from django.http import JsonResponse
from django.contrib import messages
from django.contrib.auth.decorators import login_required

PERM = "auth.can_close_period"


def _scalar_json(sql, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        row = cursor.fetchone()
    data = row[0] if row and row[0] is not None else {}
    if isinstance(data, str):
        data = json.loads(data)
    return data


@login_required
def month_close_page(request):
    if not request.user.has_perm(PERM):
        messages.error(request, "Access Denied!")
        return redirect("home:home")
    return render(request, "month_close_templates/month_close_template.html")


@login_required
def get_overview(request):
    if not request.user.has_perm(PERM):
        return JsonResponse({"closed": [], "open": []}, status=403)
    return JsonResponse(_scalar_json("SELECT get_period_closes_json();"), safe=False)


@login_required
def preview(request):
    if not request.user.has_perm(PERM):
        return JsonResponse({}, status=403)
    try:
        year = int(request.GET.get("year"))
        month = int(request.GET.get("month"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "year and month are required"}, status=400)
    try:
        return JsonResponse(_scalar_json("SELECT preview_period_close(%s, %s);", [year, month]), safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
def close_month(request):
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST required"}, status=405)
    if not request.user.has_perm(PERM):
        return JsonResponse({"status": "error", "message": "You do not have permission to close periods."}, status=403)
    try:
        body = json.loads(request.body or "{}")
        year = int(body.get("year"))
        month = int(body.get("month"))
    except (ValueError, TypeError):
        return JsonResponse({"status": "error", "message": "Valid 'year' and 'month' are required."}, status=400)

    payload = json.dumps({"year": year, "month": month, "created_by_id": request.user.id})
    try:
        data = _scalar_json("SELECT close_period_from_json(%s::jsonb);", [payload])
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    return JsonResponse({"status": "success", "result": data})


@login_required
def reverse_month(request):
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST required"}, status=405)
    if not request.user.has_perm(PERM):
        return JsonResponse({"status": "error", "message": "Permission denied."}, status=403)
    try:
        body = json.loads(request.body or "{}")
        year = int(body.get("year"))
        month = int(body.get("month"))
    except (ValueError, TypeError):
        return JsonResponse({"status": "error", "message": "Valid 'year' and 'month' are required."}, status=400)

    data = _scalar_json("SELECT reverse_period_close(%s, %s);", [year, month])
    status = 200 if data.get("status") == "success" else 404
    return JsonResponse(data, status=status)
