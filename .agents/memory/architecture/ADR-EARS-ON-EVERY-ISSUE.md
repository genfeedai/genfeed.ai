# ADR: EARS Acceptance Criteria On Every Public Issue

## Status

Accepted · 2026-08-16

## Decision

Every issue form (bug, feature, task) requires EARS acceptance criteria
(`WHEN/WHILE/WHERE/IF … THE SYSTEM SHALL …`) as a required field. Enforcement is
**rewrite, not bounce**: triage labels weak criteria `needs-ears` and an agent (or the
maintainer) rewrites them; an issue is never closed for syntax.

## Trade-off

This runs against common OSS practice (plain-language bug forms) and will cost some report
volume. It is accepted because issues are consumed by agents that need testable requirements to
act; the rewrite rule keeps the friction on the maintainer side, not the reporter's.

## Guardrail

No form validation beyond "field is required". Bounce policies or regex gates on the EARS field
require revisiting this ADR.
