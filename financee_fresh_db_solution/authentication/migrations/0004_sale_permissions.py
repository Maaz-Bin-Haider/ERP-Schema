# authentication/migrations/0004_sale_permissions.py
from django.db import migrations

def add_sale_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_sale', 'Can create sale'),
        ('update_sale', 'Can update sale'),
        ('delete_sale', 'Can delete sale'),
        ('view_sale',   'Can view sale'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )

    

class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0003_purchase_permissions'),
    ]

    operations = [
        migrations.RunPython(add_sale_permissions),
    ]