from collections.abc import MutableMapping
from dataclasses import dataclass


@dataclass
class PropertyGroupDefinition:
    filter_expression: str
    codec: str = "ZSTD(1)"


class PropertyGroupManager:
    def __init__(self, table: str, source_column: str) -> None:
        self.__table = table
        self.__source_column = source_column
        self.__groups: MutableMapping[str, PropertyGroupDefinition] = {}

    def register(self, name: str, definition: PropertyGroupDefinition) -> None:
        assert name not in self.__groups, "property group names can only be used once"
        self.__groups[name] = definition

    def __get_map_expression(self, definition: PropertyGroupDefinition) -> str:
        return f"mapSort(mapFilter((key, _) -> {definition.filter_expression}, CAST(JSONExtractKeysAndValues({self.__source_column}, 'String'), 'Map(String, String)')))"

    def get_alter_table_statements(self, name: str) -> str:
        column_name = f"{self.__source_column}_group_{name}"
        definition = self.__groups[name]
        return [
            f"ALTER TABLE {self.__table} ADD COLUMN {column_name} Map(String, string) MATERIALIZED {self.__get_map_expression(definition)} CODEC({definition.codec})",
            f"ALTER TABLE {self.__table} ADD INDEX {column_name}_keys_bf mapValues({column_name}) TYPE bloom_filter",
            f"ALTER TABLE {self.__table} ADD INDEX {column_name}_values_bf mapValues({column_name}) TYPE bloom_filter",
        ]


event_property_groups = PropertyGroupManager("events", "properties")

ignore_custom_properties = [
    # `token` & `distinct_id` properties are sent with ~50% of events and by
    # many teams, and should not be treated as custom properties and their use
    # should be optimized separately
    "token",
    "distinct_id",
    # campaign properties are defined by external entities and are commonly used
    # across a large number of teams, and should also be optimized separately
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",  # google ads
    "gad_source",  # google ads
    "gclsrc",  # google ads 360
    "dclid",  # google display ads
    "gbraid",  # google ads, web to app
    "wbraid",  # google ads, app to web
    "fbclid",  # facebook
    "msclkid",  # microsoft
    "twclid",  # twitter
    "li_fat_id",  # linkedin
    "mc_cid",  # mailchimp campaign id
    "igshid",  # instagram
    "ttclid",  # tiktok
    "rdt_cid",  # reddit
]

event_property_groups.register(
    "custom",
    PropertyGroupDefinition(
        f"key NOT LIKE '$%' AND key NOT IN (" + f", ".join(f"'{name}'" for name in ignore_custom_properties) + f")"
    ),
)

event_property_groups.register("feature_flags", PropertyGroupDefinition("key like '$feature/%'"))
