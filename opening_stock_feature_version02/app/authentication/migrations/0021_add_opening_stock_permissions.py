from django.db import migrations


PERMISSIONS = [
    ("view_opening_stock",          "Can view Opening Stock section"),
    ("create_opening_stock",        "Can add opening stock"),
    ("delete_opening_stock",        "Can delete opening stock"),
    ("reclassify_opening_balance",  "Can reclassify Opening Balance to Capital"),
]


def add_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label="auth", model="user")
    for codename, name in PERMISSIONS:
        Permission.objects.get_or_create(codename=codename, name=name, content_type=content_type)


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0020_add_contra_permissions"),
    ]

    operations = [
        migrations.RunPython(add_permissions),
    ]
