# PRD pass: verify issue state and audit code before trusting the epic body

**last_verified: 2026-07-26**

An epic body is a stale narrative, not ground truth. Before writing anything:

1. **Check real state** — `gh issue view <n> --json state,stateReason,closedAt,projects`. Epic
   bodies routinely list already-closed cards as open children. Never rewrite a shipped issue's
   body; a forward-looking PRD on shipped work misleads readers.
2. **Re-measure the surface** — grep the actual symbols/imports/counts the card claims to touch.
   Treat "Surface (from code audit)" numbers as hypotheses, not facts.
3. **Cite `file:line`.** If code contradicts issue text, the code wins — surface the delta.

Observed twice on 2026-07-03: in epic #740, 4 of 5 "open children" were already closed; in epic
#735, #792/#806 were closed, the "~537 `@clerk` sites" surface was 0, and #1041's "highest-risk"
auth file was dead unregistered code.

**Output shape per rewritten child:** Executive Summary · Problem Statement · Goals · Non-Goals ·
Surface (concrete files/counts from the audit) · Acceptance Criteria · Dependencies/Sequencing.
GitHub Issues are canonical — no local task markdown, no YAML frontmatter in issue bodies.
