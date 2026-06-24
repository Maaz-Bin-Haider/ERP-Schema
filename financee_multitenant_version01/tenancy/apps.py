"""
tenancy.apps
============
AppConfig for the tenancy app.

``ready()`` imports the signal handlers (so creating a Company auto-provisions
its schema) and the admin registrations (so Company / Membership appear on the
custom Financee admin site). Imports are done here — not at module import time —
to avoid touching the ORM / app registry before Django is fully loaded.
"""
from django.apps import AppConfig


class TenancyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tenancy"
    verbose_name = "Tenancy (multi-tenant schemas)"

    def ready(self):
        # Wire post_save -> schema provisioning.
        from . import signals  # noqa: F401

        # Register Company / Membership on the custom admin site.
        from . import admin  # noqa: F401
