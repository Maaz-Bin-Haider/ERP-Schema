# authentication/migrations/0008_parties_permissions.py
from django.db import migrations

def add_parties_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_party', 'Can create party'),
        ('update_party', 'Can update party'),
        ('view_party',   'Can view party'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )



class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0007_items_permissions'),
    ]

    operations = [
        migrations.RunPython(add_parties_permissions),
    ]