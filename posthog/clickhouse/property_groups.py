from collections.abc import Callable, Iterable, MutableMapping
from dataclasses import dataclass

from posthog import settings


@dataclass
class PropertyGroupDefinition:
    key_filter_expression: str
    key_filter_function: Callable[[str], bool]
    codec: str = "ZSTD(1)"

    def contains(self, key: str) -> bool:
        return self.key_filter_function(key)


class PropertyGroupManager:
    def __init__(self, cluster: str, table: str, column: str) -> None:
        self.__cluster = cluster
        self.__table = table
        self.__column = column
        self.__groups: MutableMapping[str, PropertyGroupDefinition] = {}

    def register(self, name: str, definition: PropertyGroupDefinition) -> None:
        assert name not in self.__groups, "property group names can only be used once"
        self.__groups[name] = definition

    def find_property_groups(self, key: str) -> Iterable[str]:
        for name, definition in self.__groups.items():
            if definition.contains(key):
                yield name

    def __get_map_expression(self, definition: PropertyGroupDefinition) -> str:
        return f"mapSort(mapFilter((key, _) -> {definition.key_filter_expression}, CAST(JSONExtractKeysAndValues({self.__column}, 'String'), 'Map(String, String)')))"

    def get_alter_create_statements(self, name: str) -> Iterable[str]:
        definition = self.__groups[name]
        map_column = f"{self.__column}_group_{name}"
        return [
            f"ALTER TABLE {self.__table} ON CLUSTER {self.__cluster} ADD COLUMN {map_column} Map(String, String) MATERIALIZED {self.__get_map_expression(definition)} CODEC({definition.codec})",
            f"ALTER TABLE {self.__table} ON CLUSTER {self.__cluster} ADD INDEX {map_column}_keys_bf mapKeys({map_column}) TYPE bloom_filter",
            f"ALTER TABLE {self.__table} ON CLUSTER {self.__cluster} ADD INDEX {map_column}_values_bf mapValues({map_column}) TYPE bloom_filter",
        ]


sharded_events_property_groups = PropertyGroupManager(settings.CLICKHOUSE_CLUSTER, "sharded_events", "properties")

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

sharded_events_property_groups.register(
    "custom",
    PropertyGroupDefinition(
        f"key NOT LIKE '$%' AND key NOT IN (" + f", ".join(f"'{name}'" for name in ignore_custom_properties) + f")",
        lambda key: not key.startswith("$") and key not in ignore_custom_properties,
    ),
)

sharded_events_property_groups.register(
    "feature_flags",
    PropertyGroupDefinition(
        "key like '$feature/%'",
        lambda key: key.startswith("$feature/"),
    ),
)
