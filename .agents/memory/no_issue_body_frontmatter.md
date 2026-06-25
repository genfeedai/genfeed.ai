---
name: no_issue_body_frontmatter
description: GitHub issue PRDs use native GitHub/project fields for metadata; never add YAML frontmatter to issue bodies
type: feedback
status: active
last_verified: 2026-06-11
topics: [github, issue-tracking, prd, workflow]
---

**Rule:** Do not put YAML frontmatter in GitHub issue bodies. Issue PRD bodies should start with `# PRD: ...` and contain only human-readable PRD content.

**Why:** GitHub renders issue-body frontmatter as visible noise, and Genfeed already tracks workflow metadata through native GitHub issue/project fields. Duplicating `status`, `priority`, `complexity`, `blast_radius`, or similar fields in the body creates drift between the issue text and project board.

**How to apply:**
- Use GitHub Project #12 fields for Status, Priority, Area, Surface, Complexity, and Blast radius.
- Use GitHub Issue Type for Feature/Bug/Task.
- Do not add `name`, `description`, `status`, `estimated_complexity`, `blast_radius`, `created`, `updated`, or similar metadata fields to the issue body.
- If an existing PRD body has frontmatter, remove it when touching the issue and preserve the readable PRD sections.
