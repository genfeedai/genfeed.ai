#!/usr/bin/env python3
"""Compare deterministic MCP exports using tiktoken==0.12.0; no model calls."""
import argparse
import importlib.metadata
import json
from pathlib import Path

import tiktoken

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
args = parser.parse_args()
version = importlib.metadata.version('tiktoken')
if version != '0.12.0':
    parser.error('Install the pinned benchmark dependency: tiktoken==0.12.0')
before, after = (json.loads(path.read_text()) for path in (args.before, args.after))
if before['fixtureVersion'] != after['fixtureVersion'] or before['payloads'].keys() != after['payloads'].keys():
    parser.error('Fixture versions and case names must match')

# A client can expose only input function definitions to the model. Measure that
# projection separately rather than assuming outputSchema enters every prompt.
for dataset in (before, after):
    for name in ('catalog/default', 'catalog/full'):
        dataset['payloads'][f'{name}/input-only'] = {'tools': [
            {'type': 'function', 'name': tool['name'], 'description': tool['description'], 'parameters': tool['inputSchema']}
            for tool in dataset['payloads'][name]['tools']
        ]}

def serialized(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

encodings = {name: tiktoken.get_encoding(name) for name in ('o200k_base', 'cl100k_base')}
cases = []
for name, original in before['payloads'].items():
    compact = after['payloads'][name]
    if name.endswith('/structured') and original != compact:
        parser.error(f'{name}: complete structured payload changed')
    if name.startswith('catalog/'):
        def without_schema(catalog):
            return [{key: value for key, value in tool.items() if key != 'outputSchema'} for tool in catalog['tools']]
        if without_schema(original) != without_schema(compact):
            parser.error(f'{name}: tool metadata changed beyond outputSchema')
    old_text, new_text = serialized(original), serialized(compact)
    old_bytes, new_bytes = len(old_text.encode()), len(new_text.encode())
    row = {'case': name, 'bytes': {'before': old_bytes, 'after': new_bytes}, 'tokens': {}}
    if name.startswith('catalog/'):
        row['toolCount'] = len(compact['tools'])
    for encoding, encoder in encodings.items():
        old_count, new_count = (len(encoder.encode(text, disallowed_special=())) for text in (old_text, new_text))
        row['tokens'][encoding] = {'before': old_count, 'after': new_count, 'saved': old_count - new_count, 'reductionPercent': round(100 * (old_count - new_count) / old_count, 2) if old_count else 0}
    cases.append(row)
print(json.dumps({'fixtureVersion': before['fixtureVersion'], 'tokenizer': f'tiktoken=={version}', 'serialization': 'compact sorted-key UTF-8 JSON', 'scope': 'Serialized payload tokens; excludes client wrappers, caching and image/audio model costs. Not billed model usage.', 'cases': cases}, indent=2))
