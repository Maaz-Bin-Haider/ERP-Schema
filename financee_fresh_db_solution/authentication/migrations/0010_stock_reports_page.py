# authentication/migrations/0010_stock_reports_permissions.py
from django.db import migrations

def add_stock_reports_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('view_serial_ledger', 'Can Open Serial Ledger'),
        ('view_stock_summary', 'Can open stock summary'),
        ('view_serial_wise_stock', 'Can open serial wise stock'),
        ('view_item_history', 'Can open item history report'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )



class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0009_accounts_reports_permissions'),
    ]

    operations = [
        migrations.RunPython(add_stock_reports_permissions),
    ]
