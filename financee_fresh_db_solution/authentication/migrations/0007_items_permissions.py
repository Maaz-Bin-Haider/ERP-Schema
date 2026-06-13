# authentication/migrations/0007_items_permissions.py
from django.db import migrations

def add_items_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_item', 'Can create item'),
        ('update_item', 'Can update item'),
        ('view_item',   'Can view item'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0006_sale_return_permissions'),
    ]

    operations = [
        migrations.RunPython(add_items_permissions),
    ]
