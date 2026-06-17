import json
from datetime import datetime
from django.shortcuts import render, redirect
from django.db import connection
from django.http import JsonResponse
from django.contrib import messages
from django.contrib.auth.decorators import login_required

# Per-report permissions (each report gated independently)
PERMS = {
    "summary":               "auth.can_view_sales_summary",
    "product_profitability": "auth.can_view_product_profitability",
    "customer_profitability":"auth.can_view_customer_profitability",
    "sales_by_product":      "auth.can_view_sales_by_product",
    "sales_by_customer":     "auth.can_view_sales_by_customer",
    "sale_wise":             "auth.can_view_sale_wise_profit",
    "trend":                 "auth.can_view_sales_trend",
    "invoice_register":      "auth.can_view_invoice_register",
}


def _scalar_json(sql, params):
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    data = row[0] if row and row[0] is not None else {}
    if isinstance(data, str):
        data = json.loads(data)
    return data


def _dates(request):
    """Read from/to off GET or JSON body; validate YYYY-MM-DD."""
    if request.method == "POST":
        try:
            body = json.loads(request.body or "{}")
        except ValueError:
            body = {}
        f, t = body.get("from"), body.get("to")
        g = body.get("granularity")
    else:
        f, t = request.GET.get("from"), request.GET.get("to")
        g = request.GET.get("granularity")
    for d in (f, t):
        datetime.strptime(d, "%Y-%m-%d")  # raises ValueError if bad
    return f, t, (g or "day")


def _report(request, perm, sql, with_granularity=False):
    if not request.user.has_perm(perm):
        return JsonResponse({"error": "You do not have permission to view this report."}, status=403)
    try:
        f, t, g = _dates(request)
    except (ValueError, TypeError):
        return JsonResponse({"error": "Valid 'from' and 'to' dates (YYYY-MM-DD) are required."}, status=400)
    try:
        params = [f, t, g] if with_granularity else [f, t]
        return JsonResponse(_scalar_json(sql, params), safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
def sales_reports_page(request):
    # Page is visible if the user can see at least one report.
    if not any(request.user.has_perm(p) for p in PERMS.values()):
        messages.error(request, "Access Denied!")
        return redirect("home:home")
    return render(request, "sales_reports_templates/sales_reports_template.html")


@login_required
def api_summary(request):
    return _report(request, PERMS["summary"], "SELECT sales_summary_json(%s, %s);")

@login_required
def api_product_profitability(request):
    return _report(request, PERMS["product_profitability"], "SELECT product_profitability_json(%s, %s);")

@login_required
def api_customer_profitability(request):
    return _report(request, PERMS["customer_profitability"], "SELECT customer_profitability_json(%s, %s);")

@login_required
def api_sales_by_product(request):
    return _report(request, PERMS["sales_by_product"], "SELECT sales_by_product_json(%s, %s);")

@login_required
def api_sales_by_customer(request):
    return _report(request, PERMS["sales_by_customer"], "SELECT sales_by_customer_json(%s, %s);")

@login_required
def api_sale_wise(request):
    return _report(request, PERMS["sale_wise"], "SELECT sale_wise_profit_json(%s, %s);")

@login_required
def api_trend(request):
    return _report(request, PERMS["trend"], "SELECT sales_trend_json(%s, %s, %s);", with_granularity=True)

@login_required
def api_invoice_register(request):
    return _report(request, PERMS["invoice_register"], "SELECT invoice_register_json(%s, %s);")
