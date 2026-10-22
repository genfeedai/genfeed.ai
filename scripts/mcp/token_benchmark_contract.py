"""Behavior-preservation checks for before/after MCP token measurements."""
import json

SCHEMA_MAPS = {'properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'}
SCHEMA_LISTS = {'allOf', 'anyOf', 'oneOf', 'prefixItems'}
SCHEMA_NODES = {'items', 'additionalItems', 'additionalProperties', 'unevaluatedItems',
                'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else'}


def identical(before, after):
    # Python equality alone would accept True == 1, including inside enums.
    return json.dumps(before, sort_keys=True) == json.dumps(after, sort_keys=True)


def schema_documentation_only(before, after):
    if not isinstance(before, dict) or not isinstance(after, dict):
        return identical(before, after)
    if before.keys() - {'description'} != after.keys() - {'description'}:
        return False
    if any('description' in node and not isinstance(node['description'], str) for node in (before, after)):
        return False
    for key, value in before.items():
        if key == 'description' and isinstance(value, str) and key not in after:
            continue
        changed = after[key]
        if key == 'description' and isinstance(value, str) and isinstance(changed, str):
            continue
        if key in SCHEMA_MAPS:
            if not isinstance(value, dict) or not isinstance(changed, dict) or value.keys() != changed.keys():
                return False
            if not all(schema_documentation_only(child, changed[name]) for name, child in value.items()):
                return False
        elif key in SCHEMA_LISTS or key == 'items' and isinstance(value, list):
            if not isinstance(value, list) or not isinstance(changed, list) or len(value) != len(changed):
                return False
            if not all(schema_documentation_only(left, right) for left, right in zip(value, changed)):
                return False
        elif key in SCHEMA_NODES:
            if not schema_documentation_only(value, changed):
                return False
        elif not identical(value, changed):
            return False
    return True


def validate_catalog(before, after, change):
    if before.keys() != after.keys() or len(before['tools']) != len(after['tools']):
        raise ValueError('catalog shape/tool count changed')
    for key in before.keys() - {'tools'}:
        if not identical(before[key], after[key]):
            raise ValueError(f'catalog {key} changed')
    for original, candidate in zip(before['tools'], after['tools']):
        if original.keys() != candidate.keys():
            raise ValueError('tool fields changed')
        for key, value in original.items():
            if change == 'output' and key == 'outputSchema':
                continue
            if change == 'input-documentation':
                if key == 'description' and isinstance(value, str) and isinstance(candidate[key], str):
                    continue
                if key in {'inputSchema', 'parameters'}:
                    if not schema_documentation_only(value, candidate[key]):
                        raise ValueError(f'{original["name"]}: input validation changed')
                    continue
            if not identical(value, candidate[key]):
                raise ValueError(f'{original["name"]}: {key} changed')
