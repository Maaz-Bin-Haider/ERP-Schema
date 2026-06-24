"""
provision_tenant
================
Create a Company (and therefore its schema) from the command line — useful for
scripted setup / CI, though the same thing happens automatically when a Company
is added through the admin.

    python manage.py provision_tenant "Acme Traders"
    python manage.py provision_tenant "Acme Traders" --owner alice

If ``--owner`` is given, that existing user is attached to the new company via a
Membership (enforcing one-company-per-user).
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from tenancy.models import Company, Membership
from tenancy.utils import schema_exists


class Command(BaseCommand):
    help = "Create a tenant Company, provision its PostgreSQL schema, and optionally attach an owner."

    def add_arguments(self, parser):
        parser.add_argument("name", help="Company / tenant display name.")
        parser.add_argument(
            "--owner",
            dest="owner",
            default=None,
            help="Username of an existing user to attach to this company.",
        )

    def handle(self, *args, **options):
        name = options["name"].strip()
        owner_username = options["owner"]

        if Company.objects.filter(name=name).exists():
            raise CommandError(f"A company named {name!r} already exists.")

        User = get_user_model()
        owner = None
        if owner_username:
            try:
                owner = User.objects.get(username=owner_username)
            except User.DoesNotExist:
                raise CommandError(f"User {owner_username!r} does not exist.")
            if Membership.objects.filter(user=owner).exists():
                raise CommandError(
                    f"User {owner_username!r} already belongs to a company "
                    "(a user can belong to only one company)."
                )

        with transaction.atomic():
            # Saving the Company fires the post_save signal which provisions the
            # physical schema from tenant_template.sql.
            company = Company.objects.create(name=name)
            if owner is not None:
                Membership.objects.create(user=owner, company=company)

        provisioned = schema_exists(company.schema_name)
        self.stdout.write(
            self.style.SUCCESS(
                f"Company {company.name!r} created (schema {company.schema_name!r}, "
                f"provisioned={provisioned})."
            )
        )
        if owner is not None:
            self.stdout.write(
                self.style.SUCCESS(f"Attached owner {owner.username!r} to {company.name!r}.")
            )
