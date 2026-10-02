---
name: Keep future delivery workflows
description: Keep browser, mobile, and IDE delivery lanes available despite dormant run history
type: feedback
---

**Rule:** Keep browser-extension, mobile EAS, and IDE packaging workflows available.
A lack of recent runs alone does not justify deleting those delivery lanes.
Manual browser and mobile runs should default to validation; publishing or remote
builds require an explicit selection. Name the IDE lane for VSIX packaging.

**Why:** The user explicitly retained these product surfaces during the GitHub
Actions audit on 2026-10-02 and asked for frontend development to take priority.

**How to apply:** Maintain packaging and prerequisite checks while the surfaces
are dormant. Require a real successful signed/store validation before describing
a future delivery lane as release-ready. Retire actual one-off diagnostics when
their purpose ends, independently of these long-term delivery workflows.
