"""
tenancy.provisioning
=====================
Materialises a tenant schema from the bundled ``sql/tenant_template.sql``.

The template is the schema-RELATIVE definition of every per-company database
object (22 tables, 171 functions, 14 views, 11 triggers, 21 sequences, plus the
structural Chart-of-Accounts seed). It is executed with the new schema first on
the ``search_path`` so that every unqualified object lands inside that schema,
while cross-schema references (``public.auth_user``) still resolve to the shared
table.

Provisioning is idempotent: if the schema already contains tables we skip it, so
re-saving a Company or replaying a signal never double-creates objects.
"""
import os

from django.db import connection, transaction

from .utils import (
    PUBLIC_SCHEMA,
    schema_has_tables,
    search_path_for,
    validate_schema_name,
)

# tenancy/sql/tenant_template.sql — shipped inside the app.
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "sql", "tenant_template.sql")


def _read_template() -> str:
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as fh:
        return fh.read()


def provision_schema(schema_name: str, force: bool = False) -> bool:
    """
    Create ``schema_name`` and populate it from the tenant template.

    Returns True if the schema was provisioned, False if it was skipped because
    it already had tables (idempotency guard). Pass ``force=True`` to run the
    template even when tables already exist (used only by management commands).

    The whole operation runs inside a single transaction; on any error the
    CREATE SCHEMA and every object are rolled back together, so a failed
    provision never leaves a half-built tenant.
    """
    validate_schema_name(schema_name)

    if not force and schema_has_tables(schema_name):
        return False

    template_sql = _read_template()
    quoted = '"%s"' % schema_name
    tenant_path = search_path_for(schema_name)

    with transaction.atomic():
        with connection.cursor() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {quoted}")
            # Forward references between functions are common in this dump;
            # defer body validation while loading.
            cur.execute("SET check_function_bodies = false")
            cur.execute(f"SET search_path TO {tenant_path}")
            try:
                cur.execute(template_sql)
            finally:
                # Always restore the shared path on this connection.
                cur.execute(f"SET search_path TO {PUBLIC_SCHEMA}")
    return True
