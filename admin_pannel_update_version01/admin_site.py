"""
Financee — custom admin site.

Adds, on top of the stock Django admin:
  * Superuser-only access to the whole admin panel.
  * Light / professional branding (Financee — Accounting Plus Inventory
    Management System, developed by Maaz Rehan).
  * A "User Activity" section that aggregates every user's activity across
    the business tables and shows which database schema each user belongs to.

This module is self-contained and additive: it does not change any existing
business logic. It only customises the admin panel.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin, GroupAdmin
from django.contrib.auth.models import User, Group
from django.db import connection
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.http import Http404

# ── Branding ────────────────────────────────────────────────────────────────
SYSTEM_NAME = "Financee"
SYSTEM_TAGLINE = "Accounting Plus Inventory Management System"
DEVELOPER = "Maaz Rehan"

# ── Activity sources ────────────────────────────────────────────────────────
# (label, table, user_column, date_column) — every business table that records
# which user created the row. date_column is cast to ::date in SQL so mixed
# timestamp / date columns compare cleanly.
ACTIVITY_SOURCES = [
    ("Items",             "items",                      "created_by",    "created_at"),
    ("Parties",           "parties",                    "created_by",    "date_created"),
    ("Payments",          "payments",                   "created_by",    "date_created"),
    ("Receipts",          "receipts",                   "created_by",    "date_created"),
    ("Sales Invoices",    "salesinvoices",              "created_by",    "invoice_date"),
    ("Purchase Invoices", "purchaseinvoices",           "created_by",    "invoice_date"),
    ("Sales Returns",     "salesreturns",               "created_by",    "return_date"),
    ("Purchase Returns",  "purchasereturns",            "created_by",    "return_date"),
    ("Contra Entries",    "contra_entries",             "created_by",    "date_created"),
    ("Opening Cash",      "opening_cash",               "created_by_id", "date_created"),
    ("Owner Equity",      "owner_equity_transactions",  "created_by_id", "date_created"),
]


def _app_schema():
    """The PostgreSQL schema the application's tables live in (e.g. 'public')."""
    try:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT table_schema FROM information_schema.tables
                WHERE table_name = 'items' AND table_type = 'BASE TABLE'
                LIMIT 1
            """)
            row = cur.fetchone()
            return row[0] if row else "public"
    except Exception:
        return "public"


def _collect_activity():
    """
    Returns a dict keyed by user id:
      { uid: {"counts": {label: n, ...}, "total": n, "last_date": date|None} }
    Each source is queried defensively so a missing table never breaks the page.
    """
    per_user = {}
    for label, table, col, datecol in ACTIVITY_SOURCES:
        try:
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT {col} AS uid, COUNT(*) AS cnt, MAX({dc})::date AS last_date "
                    "FROM {tbl} WHERE {col} IS NOT NULL GROUP BY {col}".format(
                        col=col, dc=datecol, tbl=table
                    )
                )
                rows = cur.fetchall()
        except Exception:
            rows = []
        for uid, cnt, last_date in rows:
            if uid is None:
                continue
            bucket = per_user.setdefault(uid, {"counts": {}, "total": 0, "last_date": None})
            bucket["counts"][label] = bucket["counts"].get(label, 0) + cnt
            bucket["total"] += cnt
            if last_date and (bucket["last_date"] is None or last_date > bucket["last_date"]):
                bucket["last_date"] = last_date
    return per_user


def _admin_action_counts():
    """How many admin-log actions each user has performed."""
    counts = {}
    try:
        with connection.cursor() as cur:
            cur.execute(
                "SELECT user_id, COUNT(*) FROM django_admin_log GROUP BY user_id"
            )
            for uid, cnt in cur.fetchall():
                counts[uid] = cnt
    except Exception:
        pass
    return counts


def build_user_activity():
    """Per-user activity rows for the User Activity list page."""
    activity = _collect_activity()
    admin_counts = _admin_action_counts()
    schema = _app_schema()

    rows = []
    users = User.objects.all().prefetch_related("groups").order_by("-is_superuser", "username")
    for u in users:
        a = activity.get(u.id, {"counts": {}, "total": 0, "last_date": None})
        groups = ", ".join(g.name for g in u.groups.all()) or "—"
        # last activity = latest of last record date and last_login
        last_login_date = u.last_login.date() if u.last_login else None
        last_dates = [d for d in (a["last_date"], last_login_date) if d]
        last_activity = max(last_dates) if last_dates else None

        if u.is_superuser:
            role = "Superuser"
        elif u.is_staff:
            role = "Staff"
        else:
            role = "User"

        rows.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.get_full_name() or "—",
            "email": u.email or "—",
            "role": role,
            "is_active": u.is_active,
            "groups": groups,
            "schema": schema,
            "total_actions": a["total"],
            "admin_actions": admin_counts.get(u.id, 0),
            "last_login": u.last_login,
            "date_joined": u.date_joined,
            "last_activity": last_activity,
            "counts": a["counts"],
        })
    return rows, schema


class FinanceeAdminSite(admin.AdminSite):
    site_header = f"{SYSTEM_NAME} Administration"
    site_title = f"{SYSTEM_NAME} Admin"
    index_title = SYSTEM_TAGLINE

    # ── Superuser-only access to the entire admin ──
    def has_permission(self, request):
        return bool(
            request.user and request.user.is_active and request.user.is_superuser
        )

    # ── Shared branding context for every admin page ──
    def each_context(self, request):
        ctx = super().each_context(request)
        ctx.update({
            "financee_system_name": SYSTEM_NAME,
            "financee_tagline": SYSTEM_TAGLINE,
            "financee_developer": DEVELOPER,
        })
        return ctx

    # ── Extra URLs ──
    def get_urls(self):
        custom = [
            path(
                "user-activity/",
                self.admin_view(self.user_activity_view),
                name="user_activity",
            ),
            path(
                "user-activity/<int:user_id>/",
                self.admin_view(self.user_activity_detail_view),
                name="user_activity_detail",
            ),
        ]
        return custom + super().get_urls()

    # ── Custom index with KPIs ──
    def index(self, request, extra_context=None):
        extra_context = extra_context or {}
        rows, schema = build_user_activity()
        extra_context.update({
            "kpi_total_users": User.objects.count(),
            "kpi_superusers": User.objects.filter(is_superuser=True).count(),
            "kpi_active_users": User.objects.filter(is_active=True).count(),
            "kpi_groups": Group.objects.count(),
            "kpi_total_actions": sum(r["total_actions"] for r in rows),
            "kpi_schema": schema,
        })
        return super().index(request, extra_context)

    # ── User Activity list ──
    def user_activity_view(self, request):
        rows, schema = build_user_activity()
        context = {
            **self.each_context(request),
            "title": "User Activity",
            "rows": rows,
            "schema": schema,
            "total_users": len(rows),
            "total_actions": sum(r["total_actions"] for r in rows),
        }
        return TemplateResponse(request, "admin/user_activity.html", context)

    # ── User Activity detail ──
    def user_activity_detail_view(self, request, user_id):
        try:
            user = User.objects.prefetch_related("groups", "user_permissions").get(pk=user_id)
        except User.DoesNotExist:
            raise Http404("User not found")

        rows, schema = build_user_activity()
        row = next((r for r in rows if r["id"] == user_id), None)

        # ordered breakdown following ACTIVITY_SOURCES order
        breakdown = []
        counts = (row or {}).get("counts", {})
        for label, *_ in ACTIVITY_SOURCES:
            breakdown.append({"label": label, "count": counts.get(label, 0)})

        # recent admin-log actions for this user
        recent = []
        try:
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT l.action_time, l.object_repr, l.change_message, l.action_flag,
                           COALESCE(c.model, '')
                    FROM django_admin_log l
                    LEFT JOIN django_content_type c ON c.id = l.content_type_id
                    WHERE l.user_id = %s
                    ORDER BY l.action_time DESC
                    LIMIT 25
                """, [user_id])
                for t, repr_, msg, flag, model in cur.fetchall():
                    recent.append({
                        "time": t,
                        "object": repr_,
                        "message": msg,
                        "action": {1: "Added", 2: "Changed", 3: "Deleted"}.get(flag, "—"),
                        "model": model,
                    })
        except Exception:
            pass

        context = {
            **self.each_context(request),
            "title": f"Activity — {user.username}",
            "u": user,
            "row": row,
            "breakdown": breakdown,
            "recent_actions": recent,
            "schema": schema,
            "groups": ", ".join(g.name for g in user.groups.all()) or "—",
        }
        return TemplateResponse(request, "admin/user_activity_detail.html", context)


# Single shared instance used by the URL conf.
financee_admin_site = FinanceeAdminSite(name="financee_admin")

# Register the same models the stock admin exposed (Users & Groups).
financee_admin_site.register(User, UserAdmin)
financee_admin_site.register(Group, GroupAdmin)
