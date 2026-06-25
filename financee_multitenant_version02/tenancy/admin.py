"""
tenancy.admin
=============
Register Company and Membership on the **custom** Financee admin site
(``financee.admin_site.financee_admin_site``) so the whole multi-tenant setup is
driven from the existing admin panel (business rule #18).

* Creating a Company here triggers schema provisioning (via the post_save
  signal) — no shell command required.
* ``schema_name`` and ``created_at`` are read-only: the schema name is
  machine-generated and must never be edited, or the registry would point at
  the wrong physical schema.
* Membership uses the OneToOne on ``user`` to enforce one-company-per-user; the
  admin surfaces a clear error if you try to add a second membership for a user.
"""
from django.contrib import admin

from financee.admin_site import financee_admin_site

from .models import Company, Membership


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ["user"]
    verbose_name = "Member"
    verbose_name_plural = "Members"


class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "schema_name", "is_active", "member_count", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "schema_name")
    readonly_fields = ("schema_name", "created_at")
    inlines = [MembershipInline]

    @admin.display(description="Members")
    def member_count(self, obj):
        return obj.memberships.count()


class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "company", "created_at")
    list_filter = ("company",)
    search_fields = ("user__username", "user__email", "company__name")
    autocomplete_fields = ["user", "company"]


financee_admin_site.register(Company, CompanyAdmin)
financee_admin_site.register(Membership, MembershipAdmin)
