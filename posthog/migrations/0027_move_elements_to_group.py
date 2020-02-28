# Generated by Django 3.0.3 on 2020-02-27 18:13

from django.db import migrations, transaction, models

from django.forms.models import model_to_dict
import json
import hashlib

def hash_elements(elements):
    elements_list = []
    for index, element in enumerate(elements):
        el_dict = model_to_dict(element)
        [el_dict.pop(key) for key in ['event', 'id', 'group']]
        elements_list.append(el_dict)
    return hashlib.md5(json.dumps(elements_list, sort_keys=True, default=str).encode('utf-8')).hexdigest()


def forwards(apps, schema_editor):
    Event = apps.get_model('posthog', 'Event')
    ElementGroup = apps.get_model('posthog', 'ElementGroup')
    Element = apps.get_model('posthog', 'Element')

    hashes_seen = []
    while Event.objects.filter(element__isnull=False, elements_hash__isnull=True, event='$autocapture').exists():
        with transaction.atomic():
            events = Event.objects.filter(element__isnull=False, elements_hash__isnull=True, event='$autocapture')\
                .prefetch_related(models.Prefetch('element_set', to_attr='elements_cache'))\
                .distinct('pk')[:1000]
            print('1k')
            for event in events:
                elements = event.elements_cache
                hash = hash_elements(elements)
                event.elements_hash = hash
                event.save()
                if hash not in hashes_seen:
                    with transaction.atomic():
                        group, created = ElementGroup.objects.get_or_create(team_id=event.team_id, hash=hash)
                        if created:
                            Element.objects.filter(pk__in=[el.pk for el in elements]).update(group=group, event=None)
                        hashes_seen.append(hash)

            Element.objects.filter(group__isnull=True, event__elements_hash__isnull=False).delete()
    Element.objects.filter(group__isnull=True, event__elements_hash__isnull=False).delete()

def backwards(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    atomic = False
    dependencies = [
        ('posthog', '0026_auto_20200227_0804'),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards, hints={'target_db': 'default'}),
    ]
