from django.db import migrations


PERMISSIONS = [
    ("view_contra_entry",   "Can view Contra Entry section"),
    ("create_contra_entry", "Can create contra entries"),
    ("update_contra_entry", "Can update contra entries"),
    ("delete_contra_entry", "Can delete contra entries"),
]


def add_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label="auth", model="user")
    for codename, name in PERMISSIONS:
        Permission.objects.get_or_create(codename=codename, name=name, content_type=content_type)


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0019_add_sales_reports_permissions"),
    ]

    operations = [
        migrations.RunPython(add_permissions),
    ]
