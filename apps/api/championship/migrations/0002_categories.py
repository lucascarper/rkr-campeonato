from django.db import migrations

CATEGORIES = [("RK1", "RK1", 1), ("RK2", "RK2", 2), ("RK3", "RK3", 3)]


def create_categories(apps, schema_editor):
    Category = apps.get_model("championship", "Category")
    for code, name, order in CATEGORIES:
        Category.objects.update_or_create(code=code, defaults={"name": name, "display_order": order})


class Migration(migrations.Migration):
    dependencies = [("championship", "0001_initial")]
    operations = [migrations.RunPython(create_categories, migrations.RunPython.noop)]
