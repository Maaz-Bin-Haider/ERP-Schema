from django.db import migrations


def add_month_close_permission(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    Permission.objects.get_or_create(
        codename='can_close_period',
        name='Can close accounting periods (month-end close)',
        content_type=content_type,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0017_add_owner_equity_permission'),
    ]

    operations = [
        migrations.RunPython(add_month_close_permission),
    ]
