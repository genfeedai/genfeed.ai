#!/usr/bin/env python3
"""
Post-tool hook: Warns when a controller returns data without serialization.

Checks for patterns where controller methods return raw service results
instead of wrapping them in serializeSingle() or serializeList().
"""

import json
import os
import re
import sys

data = json.load(sys.stdin)
path = data.get("tool_input", {}).get("file_path", "")

if not path:
    sys.exit(0)

base = os.path.basename(path)

if not base.endswith(".controller.ts") or not os.path.exists(path):
    sys.exit(0)

content = open(path).read()
lines = content.split("\n")

# Patterns that suggest raw document returns
raw_return_patterns = [
    re.compile(r"return\s+(?:await\s+)?this\.\w+Service\.\w+\("),
    re.compile(r"return\s+(?:await\s+)?this\.\w+Model\.\w+\("),
]

# Patterns that indicate proper serialization
serialized_patterns = [
    "serializeSingle",
    "serializeList",
    "Serializer",
    "// raw-ok",
]

warnings = []

for i, line in enumerate(lines):
    stripped = line.strip()

    # Skip if line has serialization
    if any(p in stripped for p in serialized_patterns):
        continue

    for pattern in raw_return_patterns:
        if pattern.search(stripped):
            warnings.append(f"  Line {i + 1}: {stripped}")
            break

if warnings:
    print(
        f"\n\u26a0\ufe0f  SERIALIZER WARNING in {base}:\n"
        + "\n".join(warnings)
        + "\n  Controllers should return serialized data via serializeSingle() or serializeList()."
        + "\n  Add // raw-ok comment if intentionally returning raw data.\n"
    )

sys.exit(0)
