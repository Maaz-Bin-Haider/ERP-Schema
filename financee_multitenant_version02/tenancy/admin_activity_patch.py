"""
tenancy.admin_activity_patch
============================
Optional adapter that restores the admin **"User Activity"** page's behaviour
under multi-tenancy *without editing* ``financee/admin_site.py``.

Why this is needed
------------------
Every activity query in ``admin_site.py`` runs raw SQL against the connection's
current ``search_path``. An admin request is served under ``public`` (the
superuser has no Membership), so the business tables — which now live in each
``tenant_company_<id>`` schema — are not on the path and the page's defensive
``try/except`` blocks return empty. The result is a graceful blank rather than a
cross-tenant total.

What this does
--------------
It monkey-patches three module-level functions on ``financee.admin_site`` so the
existing views (``index``, ``user_activity_view``, ``user_activity_detail_view``,
``user_activity_pdf_view``) transparently aggregate across **all** provisioned
tenant schemas:

* ``_collect_activity``      -> per-user counts summed over every tenant schema
* ``build_detailed_activity``-> a single user's detailed feed merged across schemas
* ``build_user_activity``    -> reuses the original (now cross-tenant) counts and
                                relabels each row's "schema" with the user's
                                actual company schema (from the registry)
* ``_app_schema``            -> a display label ("all tenants")

The original functions are preserved and called once per schema, so no SQL is
duplicated. Patching module globals works because the views resolve these names
from the ``admin_site`` module namespace at call time.

Enable / disable
----------------
Applied automatically from ``TenancyConfig.ready()`` unless
``TENANCY_CROSS_TENANT_ACTIVITY = False`` is set in settings. It is idempotent.

Cost note
---------
This runs the activity queries once per tenant schema. For a large number of
tenants the admin page does proportionally more work; it is an admin-only screen
so that trade-off is normally fine. If it ever matters, disable the flag.
"""
import datetime
from contextlib import contextmanager

from django.db import connection

from .utils import list_tenant_schemas, search_path_for


@contextmanager
def _activate(schema_name):
    """
    Run the wrapped block with ``schema_name`` active, then restore whatever
    search_path was in effect before (not assumed to be ``public``, so a
    superuser who also has a Membership keeps their own path afterwards).
    """
    with connection.cursor() as cur:
        cur.execute("SHOW search_path")
        previous = cur.fetchone()[0]
        cur.execute(f"SET search_path TO {search_path_for(schema_name)}")
    try:
        yield
    finally:
        with connection.cursor() as cur:
            # `previous` is a server-formatted path string; replay it verbatim.
            cur.execute(f"SET search_path TO {previous}")


def apply_patch():
    """Install the cross-tenant adapters on financee.admin_site (idempotent)."""
    from financee import admin_site as A

    if getattr(A, "_tenancy_activity_patched", False):
        return

    # Capture the originals so the adapters can call them once per schema.
    orig_collect = A._collect_activity
    orig_detail = A.build_detailed_activity
    orig_build_users = A.build_user_activity

    # ---- counts, summed across every tenant schema ------------------------ #
    def collect_activity_all_tenants():
        merged = {}
        for schema in list_tenant_schemas():
            with _activate(schema):
                partial = orig_collect()
            for uid, bucket in partial.items():
                agg = merged.setdefault(
                    uid, {"counts": {}, "total": 0, "last_date": None}
                )
                for label, n in bucket["counts"].items():
                    agg["counts"][label] = agg["counts"].get(label, 0) + n
                agg["total"] += bucket["total"]
                last = bucket["last_date"]
                if last and (agg["last_date"] is None or last > agg["last_date"]):
                    agg["last_date"] = last
        return merged

    # ---- one user's detailed feed, merged across every schema ------------- #
    def detailed_activity_all_tenants(user_id, date_from=None, date_to=None):
        all_entries = []
        summary_by_type = {}
        summary_order = []
        grand_count = 0
        grand_amount = 0

        for schema in list_tenant_schemas():
            with _activate(schema):
                entries, summary, totals = orig_detail(user_id, date_from, date_to)
            all_entries.extend(entries)
            for s in summary:
                key = s["type"]
                if key not in summary_by_type:
                    summary_by_type[key] = {
                        "type": key,
                        "icon": s["icon"],
                        "monetary": s["monetary"],
                        "count": 0,
                        "total": 0 if s["monetary"] else None,
                    }
                    summary_order.append(key)
                agg = summary_by_type[key]
                agg["count"] += s["count"]
                if s["monetary"]:
                    agg["total"] = (agg["total"] or 0) + (s["total"] or 0)
            grand_count += totals["count"]
            grand_amount += totals["amount"]

        def sort_key(e):
            d = e["date"] or datetime.date.min
            r = e["recorded_at"] or datetime.datetime.min
            return (d, r)

        all_entries.sort(key=sort_key, reverse=True)
        summary = [summary_by_type[k] for k in summary_order]
        return all_entries, summary, {"count": grand_count, "amount": grand_amount}

    # ---- map each user to their company's schema (for the display column) - #
    def user_schema_map():
        from .models import Membership

        return {
            m.user_id: m.company.schema_name
            for m in Membership.objects.select_related("company")
        }

    # ---- list rows: original counts (now cross-tenant) + real per-user schema #
    def build_user_activity_all_tenants():
        # orig_build_users() internally calls _collect_activity(), which now
        # resolves to collect_activity_all_tenants (module global) -> the
        # per-user totals are already aggregated across all tenants.
        rows, _ = orig_build_users()
        umap = user_schema_map()
        for r in rows:
            r["schema"] = umap.get(r["id"], "—")
        return rows, "all tenants"

    def app_schema_label():
        return "all tenants"

    A._collect_activity = collect_activity_all_tenants
    A.build_detailed_activity = detailed_activity_all_tenants
    A.build_user_activity = build_user_activity_all_tenants
    A._app_schema = app_schema_label
    A._tenancy_activity_patched = True
