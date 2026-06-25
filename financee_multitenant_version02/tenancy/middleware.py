"""
tenancy.middleware
==================
Request-scoped tenant activation — the heart of the isolation guarantee.

For every request this middleware:

1. Resolves the schema for the authenticated user (via their Membership).
2. Issues ``SET search_path TO "<schema>", public`` on *this request's*
   database connection, at the very start of the request.
3. Always resets the path to ``public`` in a ``finally`` block, so a connection
   returned to the pool / reused by the worker never carries a previous
   request's tenant context.

Why this is thread-/request-safe
--------------------------------
* No module-level, global, or singleton tenant variable is ever written.
  The schema lives only on the local ``request`` object and on the connection
  for the duration of the request.
* Under Gunicorn sync workers each worker processes one request at a time on
  its own connection, so two tenants can never observe each other's
  ``search_path``. Even with persistent connections (CONN_MAX_AGE), the
  start-of-request SET overwrites any stale value before a single query runs.

Resolution rules
----------------
* Unauthenticated request                -> ``public`` (login pages, static).
* Authenticated, active membership+company -> the tenant schema.
* Authenticated, no membership (e.g. a fresh superuser) -> ``public``.

Superusers still land in ``public`` by default but ``public`` is always on the
path, so the custom admin keeps working; if a superuser is also given a
Membership they additionally get that tenant's business data in the UI.
"""
from django.utils.deprecation import MiddlewareMixin

from .utils import PUBLIC_SCHEMA, reset_search_path, set_search_path


class TenantSchemaMiddleware(MiddlewareMixin):
    """Activate the current user's schema for the duration of the request."""

    def process_request(self, request):
        schema = self._resolve_schema(request)
        request.tenant_schema = schema
        set_search_path(schema)

    def process_response(self, request, response):
        reset_search_path()
        return response

    def process_exception(self, request, exception):
        # Make sure a failed request never leaves tenant context on the
        # connection. process_response also resets, but exceptions may bypass it.
        reset_search_path()
        return None

    # ------------------------------------------------------------------ #
    @staticmethod
    def _resolve_schema(request) -> str:
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return PUBLIC_SCHEMA

        # Membership is a reverse OneToOne: when the user has none, accessing
        # ``user.membership`` raises Membership.DoesNotExist (NOT None), so the
        # lookup must be guarded with try/except rather than getattr default.
        from .models import Membership

        try:
            membership = user.membership
        except Membership.DoesNotExist:
            return PUBLIC_SCHEMA

        company = membership.company
        if company is None or not company.is_active or not company.schema_name:
            return PUBLIC_SCHEMA

        return company.schema_name
