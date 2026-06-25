"""
tenancy.signals
===============
Auto-provision a tenant's schema the moment its Company row is created through
the admin (business rule #18 — everything controlled from the admin panel).

The handler is idempotent: ``provision_schema`` skips work if the schema already
has tables, so the two-step Company.save() (which emits post_save twice) cannot
double-provision.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Company
from .provisioning import provision_schema
from .utils import schema_exists


@receiver(post_save, sender=Company, dispatch_uid="tenancy_provision_company_schema")
def provision_company_schema(sender, instance: Company, **kwargs):
    """Create the physical schema once the Company has a schema_name."""
    schema = instance.schema_name
    if not schema:
        # First of the two saves — schema_name not assigned yet. Wait.
        return
    # schema_exists is cheap; provision_schema itself is the real idempotency
    # guard (checks for tables), but this avoids re-reading the template file
    # on every ordinary Company edit.
    if schema_exists(schema):
        return
    provision_schema(schema)
