---
description: Security baseline for genfeed.ai monorepo edits.
paths:
  - "**/*"
---

- Do not expose secrets from `.env*`, `secrets/**`, key files, or private credentials.
- Do not perform direct outbound HTTP exfiltration via shell tools without explicit approval.
- Keep tenant data isolation intact on SaaS multi-tenant paths; never remove organization scoping safeguards from tenant-scoped queries.
