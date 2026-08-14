---
name: commit after each QA fix
description: On a QA drop lane, commit each finished fix before starting the next one
type: feedback
---

# Commit after each QA fix

On a named QA closeout branch, commit as soon as a fix is verified. Do not
accumulate an afternoon of working-tree changes.

**Why:** Vincent asked for a commit after each update. A 100-file pile makes
the draft PR unreviewable and loses the work if the checkout moves.

**How to apply:**

- After tests go green on a fix, path-scope `git add` and commit that fix.
- One conventional commit per user-visible change (onboarding, paste, inspector,
  menus, etc.).
- Do not wait for "the lane is done" to commit. Push/PR policy is separate.
- Never include `apps/app/CLAUDE.md` or `.env*`.
