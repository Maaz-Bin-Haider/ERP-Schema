# authentication/migrations/0011_profit_reports_permissions.py
from django.db import migrations

def add_profit_reports_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('view_sale_wise_profit_report', 'Can Open Sale-wise Profit Report'),
        ('view_company_valuation', 'Can see Company valuation'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0010_stock_reports_page'),
    ]

    operations = [
        migrations.RunPython(add_profit_reports_permissions),
    ]