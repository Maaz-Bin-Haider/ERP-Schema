from django.db import migrations


PERMISSIONS = [
    ("can_view_sales_summary",          "Can view Sales Summary report"),
    ("can_view_product_profitability",  "Can view Product Profitability report"),
    ("can_view_customer_profitability", "Can view Customer Profitability report"),
    ("can_view_sales_by_product",       "Can view Sales by Product report"),
    ("can_view_sales_by_customer",      "Can view Sales by Customer report"),
    ("can_view_sale_wise_profit",       "Can view Sale-wise Profit report"),
    ("can_view_sales_trend",            "Can view Sales Trend Dashboard"),
    ("can_view_invoice_register",       "Can view Invoice Register"),
]


def add_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label="auth", model="user")
    for codename, name in PERMISSIONS:
        Permission.objects.get_or_create(
            codename=codename, name=name, content_type=content_type
        )


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0018_add_month_close_permission"),
    ]

    operations = [
        migrations.RunPython(add_permissions),
    ]
