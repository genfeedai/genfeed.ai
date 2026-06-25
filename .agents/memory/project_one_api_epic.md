---
name: One API Epic
description: Historical epic #95 for API consolidation; current deployment/auth work lives in #735 and #740
type: project
status: archived
last_verified: 2026-06-25
---

Epic: genfeedai/genfeed.ai#95

**Current source of truth:** Deployment/auth implementation is tracked by #735 (Better Auth across modes) and #740 (deployment modes), with the canonical decision in `architecture/ADR-DEPLOYMENT-MODES.md`.

**Historical scope:** #95 consolidated the app onto a single API shape for self-hosted and cloud operation. Use it only as closed historical context for the API consolidation work.

**How to apply:**
- For auth, mode detection, self-hosting, and community deployment decisions, use #735/#740 and `ADR-DEPLOYMENT-MODES.md`.
- For new implementation, follow current issues and project board fields rather than #95 phase notes.
- Closed sub-issues: #96 #97 #98 #99 #100 #101 #102 #103 #105 #106 #107 #108 #109 #110 #111 #112 #113 #114 #115 #117.
