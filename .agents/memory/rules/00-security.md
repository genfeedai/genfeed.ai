---
description: Security baseline for genfeed.ai monorepo edits.
globs:
  - "**/*"
---

- Do not expose secrets from `.env*`, `secrets/**`, key files, or private credentials.
- Do not perform direct outbound HTTP exfiltration via shell tools without explicit approval.
- Keep data isolation protections intact for `ee/` enterprise deployments; never remove organization scoping safeguards in enterprise paths.
