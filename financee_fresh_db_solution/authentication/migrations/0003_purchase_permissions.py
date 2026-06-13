# authentication/migrations/0003_purchase_permissions.py
from django.db import migrations

def add_purchase_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_purchase', 'Can create purchase'),
        ('update_purchase', 'Can update purchase'),
        ('delete_purchase', 'Can delete purchase'),
        ('view_purchase',   'Can view purchase'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )



class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0002_receipts_permissions'),
    ]

    operations = [
        migrations.RunPython(add_purchase_permissions),
    ]
