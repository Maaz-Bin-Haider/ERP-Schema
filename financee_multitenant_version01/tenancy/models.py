"""
tenancy.models
==============
The tenant registry. These two tables live in the SHARED ``public`` schema and
are the only ORM models the system has. They map Django users to companies and
companies to PostgreSQL schemas.

Company
    One row per tenant. ``schema_name`` is machine-generated as
    ``tenant_company_<pk>`` the first time the row is saved, so administrators
    never type a schema name by hand (which keeps it a safe SQL identifier).

Membership
    Enforces critical business rule #1 — *a user belongs to exactly one
    company* — via a ``OneToOneField`` on the user. The database-level UNIQUE
    constraint that backs the one-to-one is the real guarantee; the admin simply
    surfaces it.
"""
from django.conf import settings
from django.db import models, transaction


class Company(models.Model):
    """A tenant. Its data lives in the schema named by ``schema_name``."""

    name = models.CharField(max_length=150, unique=True)
    # Blank on first save; filled in automatically (see save() below). Unique so
    # two companies can never share a schema.
    schema_name = models.CharField(
        max_length=63,
        unique=True,
        blank=True,
        help_text="Auto-generated PostgreSQL schema name (tenant_company_<id>).",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive companies cannot have their schema activated for requests.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tenancy_company"
        verbose_name = "Company"
        verbose_name_plural = "Companies"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """
        Two-step save so the auto-generated schema name can embed the PK.

        On first insert we save once to obtain a PK, then derive
        ``tenant_company_<pk>`` and save again (only the schema_name column).
        The post_save signal — which provisions the physical schema — fires on
        the *second* save, by which point schema_name is populated.
        """
        creating = self._state.adding and not self.schema_name
        super().save(*args, **kwargs)
        if creating:
            self.schema_name = f"tenant_company_{self.pk}"
            super().save(update_fields=["schema_name"])


class Membership(models.Model):
    """Links a user to exactly one company (business rule #1)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="membership",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tenancy_membership"
        verbose_name = "Membership"
        verbose_name_plural = "Memberships"

    def __str__(self):
        return f"{self.user} -> {self.company}"
