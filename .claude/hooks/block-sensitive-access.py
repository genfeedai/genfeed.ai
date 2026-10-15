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
    r"\b(cat|less|more|head|tail|grep|rg|awk|sed|curl|wget|httpie)\b.*(secrets/|\.pem|id_rsa|private[_-]?key)",
    compact,
)
outbound_http = re.search(r"\b(curl|wget|httpie)\b", compact)

# Clean-machine install QA (#6965) needs to fetch the release bundle: allow
# outbound HTTP only when GENFEED_QA_CLEAN_INSTALL=1 is explicitly set.
if os.environ.get("GENFEED_QA_CLEAN_INSTALL") == "1":
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
