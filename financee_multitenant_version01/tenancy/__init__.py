"""
tenancy
=======
Schema-per-tenant support for the Financee accounting + inventory system.

This app is **additive**: it introduces a tenant registry (Company / Membership)
in the shared ``public`` schema, a request-scoped middleware that points the
PostgreSQL ``search_path`` at the current user's tenant schema, and the
provisioning logic that materialises a new schema from the bundled SQL template.

It deliberately contains NO business models — all business objects live in the
database as raw SQL (tables / functions / views / triggers) and resolve through
``search_path``, exactly as the original single-schema system did.
"""

default_app_config = "tenancy.apps.TenancyConfig"
