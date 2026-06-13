# authentication/migrations/0001_payments_permissions.py
from django.db import migrations

def add_payments_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('create_payment', 'Can create payment'),
        ('update_payment', 'Can update payment'),
        ('delete_payment', 'Can delete payment'),
        ('view_payment',   'Can view payment'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )

class Migration(migrations.Migration):

    dependencies = [
        ('contenttypes', '__latest__'),
        ('auth', '__latest__'),
    ]

    operations = [
        migrations.RunPython(add_payments_permissions),
    ]
