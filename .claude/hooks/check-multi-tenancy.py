#!/usr/bin/env python3
"""
Post-tool hook: Checks service/controller files for query safety violations.

Two tiers:
- Global (all .service.ts/.controller.ts): isDeleted and findById checks
- Path-scoped (ee/** or files importing ee/ packages): organization filter checks

Respects `// org-exempt` whitelist comments.
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
is_service = base.endswith(".service.ts") or base.endswith(".controller.ts")

if not is_service or not os.path.exists(path):
    sys.exit(0)

content = open(path).read()
lines = content.split("\n")

# Determine if this file is enterprise/multi-tenant scoped
is_ee_path = "/ee/" in path or path.startswith("ee/")
imports_ee = bool(re.search(r"from\s+['\"]@genfeedai/.*ee", content))
is_enterprise = is_ee_path or imports_ee

query_pattern = re.compile(
    r"\.(find|findOne|findById|aggregate|updateOne|updateMany|deleteOne|deleteMany)\("
)
find_by_id_pattern = re.compile(r"\.findById\(")

org_warnings = []
deleted_warnings = []
find_by_id_warnings = []

for i, line in enumerate(lines):
    if not query_pattern.search(line):
        continue
    if "// org-exempt" in line:
        continue

    line_num = i + 1
    stripped = line.strip()

    # Global check: findById (always flagged)
    if find_by_id_pattern.search(line):
        find_by_id_warnings.append(
            f"  Line {line_num}: {stripped}"
        )
        continue

    # Path-scoped check: organization filter (only for enterprise code)
    if is_enterprise and "organization" not in line:
        context = "\n".join(lines[max(0, i - 3) : i + 4])
        if "organization" not in context:
            org_warnings.append(f"  Line {line_num}: {stripped}")

    # Global check: isDeleted filter
    if "isDeleted" not in line:
        context = "\n".join(lines[max(0, i - 3) : i + 4])
        if "isDeleted" not in context:
            deleted_warnings.append(f"  Line {line_num}: {stripped}")

output = []

if org_warnings:
    output.append(
        f"\n\u26a0\ufe0f  MULTI-TENANCY WARNING in {base} (enterprise code path):\n"
        + "\n".join(org_warnings)
        + "\n  Enterprise code must include organization filter in all queries."
        + "\n  Add // org-exempt if this query is intentionally unscoped."
    )

if find_by_id_warnings:
    output.append(
        f"\n\u26a0\ufe0f  findById WARNING in {base}:\n"
        + "\n".join(find_by_id_warnings)
        + "\n  Prefer .findOne({ _id, ... }) for explicit scoping."
    )

if deleted_warnings:
    output.append(
        f"\n\u26a0\ufe0f  SOFT-DELETE WARNING in {base}:\n"
        + "\n".join(deleted_warnings)
        + "\n  Consider adding isDeleted: false to user-facing queries."
    )

if output:
    print("\n".join(output) + "\n")

sys.exit(0)
