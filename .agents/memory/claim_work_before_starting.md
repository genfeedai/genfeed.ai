---
name: Claim work before starting it — search open PRs first
description: Parallel sessions duplicate each other; search open PRs and branches before branching or spawning a fix task
type: feedback
status: active
last_verified: 2026-08-05
topics: [workflow, git, automation, parallel-sessions, duplicate-work]
---

**Rule:** Before opening a branch, spawning a fix task, or starting remediation,
search the open PRs for the files and the symptom. Whoever pushed first owns the
work; everyone else contributes to that PR or picks something else.

**Why it matters:**

Many sessions run against this repo at once — 15+ worktrees is normal. Each one
sees the same red CI, the same audit report, the same broken file, and each one
starts fixing it locally. Git gives no signal until push, so the duplication is
invisible until three branches carry the same diff.

Measured on 2026-08-05:

- `models.service.ts` (TS2552) got **three** PRs — #2392, #2395, #2402 — for one
  bug. #2392 was already open, with the fix plus the regenerated OpenAPI spec plus
  ~20 spec repairs, 74 minutes before the third one was spawned.
- The `packages/models` org-setting fixtures got two byte-identical commits, one
  of them on an unrelated SEO branch.
- The Ahrefs SEO backlog got **three** parallel remediations: #2389 (19:38),
  #2398 (20:48), #2399 (20:52). #2399 overlaps #2389 on 22 of its 57 files;
  #2398 overlaps on 7 of 22 — and they disagree on the fix. #2389 corrected the
  `SoftwareApplication` rule to accept `offers`; #2398 retyped 28 payloads to
  `WebPage`. Both are defensible. Only one can land, so one session's work is
  discarded either way.

The cost is not just tokens. Conflicting diffs over the same files have to be
reconciled by hand, and the reconciliation is harder than the original fix.

**How to apply:**

- Before creating a branch or spawning a fix task, search for prior claims:

  ```bash
  gh pr list --state open --search "<file-or-symptom>"
  gh pr list --state open --json number,headRefName,title
  git fetch origin && git branch -r --sort=-committerdate | head -20
  ```

  `CLAUDE.md` already mandates this for issues (`gh issue list --search` before
  opening one). It applies at least as strongly to PRs — a duplicate issue is
  noise, a duplicate PR is a merge conflict.

- **Red CI on `master` is a global signal with a global owner.** It is visible to
  every session simultaneously, which makes it the single most duplicated piece
  of work in the repo. Check `gh pr list --state open --search "master green"`
  and the failing file's name before touching it. If a hotfix PR exists, review
  or extend it; do not open a second one.

- **A broad audit report is also a global signal.** Ahrefs output, a security
  scan, a QA sweep — anything that hands several sessions the same finding list.
  Announce the scope on a PR early, even before the work is finished: an open PR
  is the only claim mechanism that other sessions can actually see.

- Push the branch early. A local commit claims nothing.

- Before spawning a background task for a fix, run the same search. A spawned
  chip inherits none of this session's knowledge and will happily re-fix a bug
  that already has a PR.

- On finding a duplicate: keep the **older** PR, comment on the newer one
  pointing at it, close the newer one, and port over anything it has that the
  older one lacks. Do not merge both.
