# PRD pass: verify issue state + audit code before trusting the epic body

**last_verified: 2026-07-03**

When doing a PRD/planning pass over an epic and its children, the epic body is a **stale narrative**, not ground truth. Establish reality first, then write.

## Do this first, every time

1. **Verify every issue's real state** — `gh issue view <n> --json state,stateReason,closedAt,projects`. Epic bodies routinely list already-**closed/Done** cards as "open children." Never rewrite a closed, shipped issue's body — a forward-looking PRD on shipped work misleads readers.
2. **Audit the real code surface** the card claims to touch — grep for the actual symbols/imports/counts. Epic "Surface (from code audit)" numbers go stale fast; treat them as hypotheses to re-measure, not facts to repeat.
3. **Ground every claim in a path you read.** Cite `file:line`. If the code contradicts the issue text, the code wins — surface the delta.

## Why (observed twice)

- Epic #740 pass (2026-07-03 S2): 4 of 5 "open children" were already closed/merged; only 1 genuinely open.
- Epic #735 pass (2026-07-03 S3): #792/#806 listed as open were closed/Done; the "~537 @clerk sites" surface was fiction (0 remained); #1041's "highest-risk" auth file was dead/unregistered code.

In both, the stated surface and child list were wrong in ways that would have produced misleading PRDs if taken at face value.

## Output shape for each rewritten child

Executive Summary · Problem Statement · Goals · Non-Goals · Surface (concrete files/counts from the audit) · Acceptance Criteria · Dependencies/Sequencing. GitHub Issues are canonical — no local task markdown, no YAML frontmatter in issue bodies.
