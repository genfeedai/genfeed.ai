---
name: issue_titles_imperative
description: Issue titles are short imperative phrases with no conventional-commit prefix
type: feedback
status: active
last_verified: 2026-09-03
topics: [github, issue-tracking, workflow]
---

**Rule:** A GitHub issue title is one short imperative phrase, about 50 characters or fewer, with
no `feat:` / `fix:` / `chore:` prefix and no trailing explainer. Detail lives in the body.

- Good: `Add generation context picker`, `Index ad creative mapping lookups by tenant`.
- Bad: `feat: Knowledge Sources — Prisma tables + purpose enum + tenant indexes (Phase 1)`.

**Why:** Titles are read in board cards, sub-issue lists, and PR `Closes #N` lines where long
titles truncate. Conventional-commit prefixes belong to commits and PRs; the issue type field
already says whether an item is a Feature, Bug, or Task.

**How to apply:**
- Retitle an issue when you touch it and its title breaks the rule.
- Issue forms in `.github/ISSUE_TEMPLATE/` carry no `title:` prefill.
- Exempt: automated scheduled-failure titles (release E2E, nightly runs); the auto-close matcher
  keys on them.
