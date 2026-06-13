# authentication/migrations/0006_sale_return_permissions.py
from django.db import migrations

def add_sale_return_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_sale_return', 'Can create sale_return'),
        ('update_sale_return', 'Can update sale_return'),
        ('delete_sale_return', 'Can delete sale_return'),
        ('view_sale_return',   'Can view sale_return'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )

    


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0005_purchase_return_permissions'),
    ]

    operations = [
        migrations.RunPython(add_sale_return_permissions),
    ]