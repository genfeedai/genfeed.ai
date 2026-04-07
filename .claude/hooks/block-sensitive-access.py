#!/usr/bin/env python3
import json
import re
import sys

payload = json.load(sys.stdin)
command = payload.get("tool_input", {}).get("command", "")
compact = re.sub(r"\s+", " ", command.strip().lower())

secret_read = re.search(r"\b(cat|less|more|head|tail|grep|rg|awk|sed)\b.*(\.env|secrets/|\.pem|id_rsa|private[_-]?key)", compact)
outbound_http = re.search(r"\b(curl|wget|httpie)\b", compact)

if secret_read:
    print("Blocked: command appears to read sensitive material (.env/secrets/keys).", file=sys.stderr)
    sys.exit(2)

if outbound_http:
    print("Blocked: outbound HTTP tools (curl/wget/httpie) require explicit user approval in-task.", file=sys.stderr)
    sys.exit(2)

sys.exit(0)
