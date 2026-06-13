# authentication/migrations/0002_receipts_permissions.py
from django.db import migrations

def add_receipts_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_receipt', 'Can create receipt'),
        ('update_receipt', 'Can update receipt'),
        ('delete_receipt', 'Can delete receipt'),
        ('view_receipt',   'Can view receipt'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0001_payments_permissions'),
    ]

    operations = [
        migrations.RunPython(add_receipts_permissions),
    ]
