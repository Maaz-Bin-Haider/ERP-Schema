"""
tenancy 0001_initial
====================
Creates the tenant registry tables in the shared ``public`` schema:
``tenancy_company`` and ``tenancy_membership``.

These definitions are kept byte-compatible with the DDL emitted in
``build_multitenant_db.sql`` / ``migrate_existing_to_tenant.sql`` (section "1b.
Tenancy registry tables"). On a database built from those SQL scripts the
``django_migrations`` table already contains a ('tenancy', '0001_initial') row,
so ``manage.py migrate`` treats this migration as applied and does not attempt
to recreate the tables. On a fresh database built purely through Django, this
migration creates them.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Company",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=150, unique=True)),
                (
                    "schema_name",
                    models.CharField(
                        blank=True,
                        help_text="Auto-generated PostgreSQL schema name (tenant_company_<id>).",
                        max_length=63,
                        unique=True,
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                        help_text="Inactive companies cannot have their schema activated for requests.",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Company",
                "verbose_name_plural": "Companies",
                "db_table": "tenancy_company",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Membership",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        to="tenancy.company",
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Membership",
                "verbose_name_plural": "Memberships",
                "db_table": "tenancy_membership",
            },
        ),
    ]
