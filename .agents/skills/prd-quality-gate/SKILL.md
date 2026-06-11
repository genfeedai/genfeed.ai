---
name: prd-quality-gate
description: Use when checking whether a Genfeed GitHub issue body is a complete Shipcode-format PRD before planning or implementation. Validates native GitHub metadata, required sections, title length, three feature phases, and concrete verification criteria.
---

<prd_quality_gate>
A well-formed PRD GitHub issue uses native GitHub/project fields for metadata
and keeps the issue body focused on human-readable PRD content.

Do not require or add YAML frontmatter to GitHub issue bodies. GitHub renders
issue-body frontmatter as visible noise, and the repository uses native GitHub
issue/project metadata as the source of truth.

Required native metadata:
- Issue type: Feature | Bug | Task
- Project status: Backlog | Todo | In Progress | Human Review | Done | Deferred
- Project priority: P0 | P1 | P2 | P3
- Project complexity: Low | Medium | High
- Project blast radius: Contained | Cross-package | Cross-app | Infra

Required issue-body shape:
- Starts with `# PRD: <name>`
- Contains all required markdown sections before it is ready for implementation.

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
- The `# PRD:` heading must be aligned with the issue title.
- Feature Phase Breakdown must describe exactly three ordered phases.
- Success Criteria and Out of Scope must each contain at least one concrete bullet.
- User Stories must include explicit acceptance checks.
- System Specification must cover observable behavior and boundaries, not implementation file names.
- Verification Plan must name test files, suite names, or concrete manual QA steps.
- No TODO, TBD, or placeholder text may remain when status is backlog.

If any gate fails:
- Keep the issue out of runnable workflow status through native GitHub/project fields.
- Report the exact missing or weak sections.
- Do not start implementation until the issue body is fixed.
</prd_quality_gate>
