#!/usr/bin/env python3
import json
import os
import re
import sys

payload = json.load(sys.stdin)
command = payload.get("tool_input", {}).get("command", "")
compact = re.sub(r"\s+", " ", command.strip().lower())

# Local `.env*` is allowed — operators intentionally hand Claude production
# credentials for deploy/debug. Still block key material and `secrets/`.
secret_read = re.search(
    r"\b(cat|less|more|head|tail|grep|rg|awk|sed)\b.*(secrets/|\.pem|id_rsa|private[_-]?key)",
    compact,
)
outbound_http = re.search(r"\b(curl|wget|httpie)\b", compact)

# Clean-machine install QA (#6965) needs to fetch the release bundle: allow
# outbound HTTP outside the repo checkout or when GENFEED_QA_CLEAN_INSTALL=1.
repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
cwd = os.path.realpath(payload.get("cwd") or os.getcwd())
if (
    os.environ.get("GENFEED_QA_CLEAN_INSTALL") == "1"
    or os.path.commonpath([repo_root, cwd]) != repo_root
):
    outbound_http = None

if secret_read:
    print(
        "Blocked: command appears to read sensitive material (secrets/keys).",
        file=sys.stderr,
    )
    sys.exit(2)

if outbound_http:
    print(
        "Blocked: outbound HTTP tools (curl/wget/httpie) require explicit user approval in-task.",
        file=sys.stderr,
    )
    sys.exit(2)

sys.exit(0)
