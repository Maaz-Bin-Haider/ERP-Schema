# authentication/migrations/0005_purchase_return_permissions.py
from django.db import migrations

def add_purchase_return_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_purchase_return', 'Can create purchase_return'),
        ('update_purchase_return', 'Can update purchase_return'),
        ('delete_purchase_return', 'Can delete purchase_return'),
        ('view_purchase_return',   'Can view purchase_return'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )

    


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_sale_permissions'),
    ]

    operations = [
        migrations.RunPython(add_purchase_return_permissions),
    ]