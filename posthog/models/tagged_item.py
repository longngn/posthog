from typing import List, Union

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from posthog.models.utils import UUIDModel

# RELATED_OBJECTS = ("dashboard", "insight", "event_definition", "property_definition", "action", "feature_flag")
RELATED_OBJECTS = ("action",)


def build_check():
    # All object fields can be null
    built_check_list: List[Union[Q, Q]] = [
        Q(*[(f"{o_field}__isnull", True) for o_field in RELATED_OBJECTS], _connector="AND")
    ]
    # Only one object field can be populated
    for o_field in RELATED_OBJECTS:
        built_check_list.append(
            Q(*[(f"{_o_field}__isnull", _o_field != o_field) for _o_field in RELATED_OBJECTS], _connector="AND")
        )
    return Q(*built_check_list, _connector="OR")


class TaggedItem(UUIDModel):
    """
    Taggable describes global tag-object relationships.
    Note: This is an EE only feature, however the model exists in posthog so that it is backwards accessible from all
    models. Whether we should be able to interact with this table is determined in the `TaggedItemSerializer` which
    imports `EnterpriseTaggedItemSerializer` if the feature is available.
    Today, tags exist at the model-level making it impossible to aggregate, filter, and query objects appwide by tags.
    We want to deprecate model-specific tags and refactor tag relationships into a separate table that keeps track of
    tag-object relationships.
    Models that had in-line tags before this table was created:
    - ee/models/ee_event_definition.py
    - ee/models/ee_property_definition.py
    - models/dashboard.py
    - models/insight.py
    Models that are taggable throughout the app are listed as separate fields below.
    https://docs.djangoproject.com/en/4.0/ref/contrib/contenttypes/#generic-relations
    """

    tag: models.ForeignKey = models.ForeignKey("Tag", on_delete=models.CASCADE, related_name="taggeditems")

    # A column is created to hold the foreign keys of each model that is taggable. At most one of the columns below
    # can be populated at any time.
    # dashboard: models.ForeignKey = models.ForeignKey(
    #     "Dashboard", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    # )
    # insight: models.ForeignKey = models.ForeignKey(
    #     "Insight", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    # )
    # event_definition: models.ForeignKey = models.ForeignKey(
    #     "EventDefinition", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    # )
    # property_definition: models.ForeignKey = models.ForeignKey(
    #     "PropertyDefinition", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    # )
    action: models.ForeignKey = models.ForeignKey(
        "Action", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    )
    # feature_flag: models.ForeignKey = models.ForeignKey(
    #     "FeatureFlag", on_delete=models.CASCADE, null=True, blank=True, related_name="tags"
    # )

    class Meta:
        # Make sure to add new key to uniqueness constraint when extending tag functionality to new model
        unique_together = ("tag",) + RELATED_OBJECTS
        constraints = [models.CheckConstraint(check=build_check(), name="at_most_one_related_object",)]

    def clean(self):
        super().clean()
        """Ensure that only one of object columns can be set."""
        if sum(map(bool, [getattr(self, o_field) for o_field in RELATED_OBJECTS])) > 1:
            raise ValidationError("At most one object field must be set.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super(TaggedItem, self).save(*args, **kwargs)

    def __str__(self):
        return self.tag
