from posthog.clickhouse.client.migration_tools import run_sql_with_exceptions
from posthog.clickhouse.property_groups import events_property_groups

operations = [
    run_sql_with_exceptions(statement)
    for statement in [
        *events_property_groups.get_alter_table_statements("custom"),
        *events_property_groups.get_alter_table_statements("feature_flags"),
    ]
]
