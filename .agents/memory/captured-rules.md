---
status: temporary
last_verified: 2026-07-03
---

### [2026-07-03 15:00] - Auth UI: Do Not Expose Unconfigured OAuth Providers

**User said (redacted):**

> "provider is not even set up properly on beta auth"

**Rule extracted:**

- **Type**: AVOID
- **Action**: Do not expose OAuth providers in public login or sign-up UI unless that provider is actually configured and verified for the target auth environment.
- **Context**: Beta Better Auth login/sign-up surfaces and tests.
- **Category**: coding

**Status**: PENDING_REVIEW

### [2026-08-07] - Workflow: Commit after every finished fix

**User said (redacted):**

> "commit everytime you finnish a fix..."

**Rule extracted:**

- **Type**: ALWAYS
- **Action**: Commit as soon as a fix is finished (one fix → one commit). Do not leave completed fixes sitting uncommitted while continuing QA or the next bug.
- **Context**: Interactive QA sessions and any shippable work on feature branches.
- **Category**: workflow

**Status**: PENDING_REVIEW

### [2026-08-07] - Workflow: Stay on the QA branch for the whole session

**User said (redacted):**

> "do not change the branch during QA, right."

**Rule extracted:**

- **Type**: NEVER
- **Action**: Do not switch branches, create new branches, or use worktrees mid-session once a QA branch is active. All fixes, commits, and pushes stay on that branch.
- **Context**: Interactive QA sessions (e.g. `qa/interactive-*`) with local servers and `.env` credentials on the main checkout.
- **Category**: workflow

**Status**: PENDING_REVIEW
