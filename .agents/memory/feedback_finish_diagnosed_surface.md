---
name: finish diagnosed surface
description: When an incident is diagnosed, finish every leftover on that surface in the same pass
type: feedback
status: active
last_verified: 2026-08-23
topics: [workflow, completeness, leftovers]
---

**Rule:** After a production incident is diagnosed, finish every leftover on that surface in the same pass. Do not stop at the first root-cause patch and list the rest as optional follow-ups.

**Why:** Listing "not worth a second PR unless you want it" items is how cards keep jumping after sockets reconnect, and how env fallbacks stay as the only production JWKS path. Completeness is the default.

**How to apply:**

- Ship the root-cause fix and every leftover that would still reproduce the user-visible failure.
- Keep one surface on one PR. Adjacent leftovers on that surface (prefs, env, reconnect backoff, card isolation) ride the same branch.
- A different surface (for example a closed generate-403 epic whose code already shipped) is not in-scope just because it is P0 on the board. Re-verify it; do not re-implement closed children.
- Do not leave "set this env later" or "prefs are still global" as conversation-only notes.
