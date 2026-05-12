---
name: prd-quality-gate
description: Use when checking whether a Genfeed GitHub issue body is a complete Shipcode-format PRD before planning or implementation. Validates frontmatter, required sections, title length, three feature phases, and concrete verification criteria.
---

<prd_quality_gate>
A well-formed PRD GitHub issue body must contain all required frontmatter fields
and all required markdown sections before it is ready for implementation.

Required frontmatter:
- name
- description
- status
- estimated_complexity
- blast_radius

Allowed frontmatter values:
- status: draft | backlog | active | blocked | completed
- estimated_complexity: low | medium | high
- blast_radius: contained | cross-package | cross-app | infra

Required sections, in order:
- Executive Summary
- Problem Statement
- Goals
- Non-Goals
- User Stories
- System Specification
- Functional Requirements
- Non-Functional Requirements
- Feature Phase Breakdown
- Success Criteria
- Out of Scope
- Dependencies
- Verification Plan
- Risks & Open Questions

Additional quality rules:
- Issue title should be 4-7 words and use imperative verb + object.
- Frontmatter `name` must be kebab-case and aligned with the slugified issue title.
- Feature Phase Breakdown must describe exactly three ordered phases.
- Success Criteria and Out of Scope must each contain at least one concrete bullet.
- User Stories must include explicit acceptance checks.
- System Specification must cover observable behavior and boundaries, not implementation file names.
- Verification Plan must name test files, suite names, or concrete manual QA steps.
- No TODO, TBD, or placeholder text may remain when status is backlog.

If any gate fails:
- Keep status as draft.
- Report the exact missing or weak sections.
- Do not start implementation until the issue body is fixed.
</prd_quality_gate>
