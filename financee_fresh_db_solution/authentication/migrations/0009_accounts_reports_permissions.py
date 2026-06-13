# authentication/migrations/0009_accounts_reports_permissions.py
from django.db import migrations

def add_account_reports_permissions(apps, schema_editor):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')

    permissions = [
        ('view_accounts_reports_page', 'Can view Accounts Reports Page'),
        ('view_detailed_ledger', 'Can open detailed party ledgers'),
        ('view_trial_balance', 'Can open trial balance'),
    ]

    for codename, name in permissions:
        Permission.objects.get_or_create(
            codename=codename,
            name=name,
            content_type=content_type
        )

    


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0008_parties_permissions'),
    ]

    operations = [
        migrations.RunPython(add_account_reports_permissions),
    ]