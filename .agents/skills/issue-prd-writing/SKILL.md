---
name: issue-prd-writing
description: Use when drafting, repairing, or validating implementation-ready GitHub issue PRDs for Genfeed work. Applies the Shipcode PRD issue-body format: short issue titles, native GitHub/project metadata, required PRD sections, three feature phases, and quality gates before implementation.
---

# Issue PRD Writing

The GitHub issue body is the PRD. Do not create sidecar PRD files unless the
user explicitly asks for archival documentation.

## Native GitHub Metadata

Do not put YAML frontmatter at the top of GitHub issue bodies. GitHub renders
issue-body frontmatter as visible noise and already has native places for this
metadata.

Use native GitHub and Projects fields instead:

- **Issue type:** `Feature`, `Bug`, or `Task`.
- **Project status:** `Todo`, `In Progress`, `Done`, or `On hold`.
- **Project priority:** `P0`, `P1`, `P2`, or `P3`.
- **Project complexity:** `Low`, `Medium`, or `High`.
- **Project blast radius:** `Contained`, `Cross-package`, `Cross-app`, or `Infra`.

Rules:

- The PRD body starts with `# PRD: <name>` and contains only human-readable PRD content.
- The `# PRD:` name should match the issue title's slugified form.
- Keep concise card/list summary text in the issue title, project fields, or Executive Summary.
- `Draft` is workflow state, not body text. Keep draft PRDs off the runnable board path through project status or app state.
- Do not add `created`, `updated`, `github_issue`, `github_repo`, `status`, `complexity`, or blast-radius fields to the issue body; GitHub is the source of truth.

## Issue Title Style

Keep issue titles short and board-readable.

- Prefer 4-7 words.
- Prefer imperative verb + object: `Add draft PR feedback loop`.
- Put details in the Executive Summary and PRD body, not in the title.
- Avoid long chained titles joined by `and`, `while`, or `during`.
- Keep the `# PRD:` heading aligned with the final shortened title.

## Required Sections

Every PRD must have these sections, in this order:

```markdown
# PRD: <name>

## Executive Summary
<2-4 sentences. What is this feature, why now, who wins.>

## Problem Statement
<The concrete pain. Reference real incidents, real users, real metrics where possible.>

## Goals
- <measurable, verifiable goal>

## Non-Goals
- <thing this explicitly does NOT do>

## User Stories
- As a <role>, I want <capability> so that <outcome>.
  **Acceptance:** <1-3 concrete checks>

## System Specification
<Observable system contract: states, data contracts, permissions/trust boundaries,
failure behavior, and integration points. Do not name files, functions,
libraries, or implementation details.>

## Functional Requirements
1. <Verifiable system behavior.>

## Non-Functional Requirements
<Performance, accessibility, error handling, offline behavior, observability.
Only list what matters.>

## Feature Phase Breakdown
<Exactly three product-level phases:
1. Foundation/spec plumbing.
2. Primary feature behavior.
3. Hardening/verification/shipping polish.
Each phase must include purpose, in-scope behavior, out-of-scope behavior, and
a concrete completion signal.>

## Success Criteria
- <Verifiable pass/fail outcome.>

## Out of Scope
- <Explicitly excluded work.>

## Dependencies
<Other PRDs, packages, external APIs, feature flags, paths, or URLs.>

## Verification Plan
<Tests and/or manual QA steps that prove the work shipped correctly.>

## Risks & Open Questions
<Unknowns, edge cases, blockers, and unresolved product questions.>
```

## Quality Gates

Before marking a PRD ready for implementation, all of these must pass:

- No placeholder text (`TODO`, `TBD`, `<fill this in>`) remains.
- `Goals` has at least one measurable bullet.
- `Success Criteria` has at least one verifiable pass/fail bullet.
- `Out of Scope` has at least one bullet.
- `User Stories` has at least one story with explicit acceptance checks.
- `System Specification` names observable states, data contracts, permissions/trust boundaries, and failure behavior.
- `Feature Phase Breakdown` contains exactly three ordered phases.
- `Dependencies` names concrete packages, PRD paths, URLs, or says `None`.
- `Verification Plan` names test files, suite names, or concrete manual steps.

If any gate fails, keep the issue in draft/on-hold workflow state and list the missing gates.

## Anti-Patterns

- Implementation details in requirements. The PRD says what; the plan decides how.
- Vague success criteria like "feels fast" or "works well".
- Empty `Out of Scope`.
- Long issue titles that duplicate the whole PRD.
- Creating duplicate issues instead of updating the canonical issue.
