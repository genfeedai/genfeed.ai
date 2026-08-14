---
name: strategy lives in vault
description: Competitive strategy and win-plans live in private genfeedai/vault, not this public repo
type: feedback
status: active
last_verified: 2026-08-14
topics: [workflow, open-source, strategy, vault, board]
---

**Rule:** Competitive audits, win-strategy, and “how we beat X” write-ups belong in the private `genfeedai/vault` repo. Do not add them to this public AGPL repo’s issues, Project #12, or `.agents/memory/`.

**Why:** `genfeed.ai` and its board are public. Strategy is private. #2967 / #2968 put a studio competitor teardown on the public board and in memory; that was the wrong home.

**How to apply:**
- Product PRDs and implementation specs stay here when they describe shipped or soon-to-ship product behavior (example: Studio generation meter).
- Do not file public issues that are only competitor teardowns or category win-plans.
- Do not commit `reference_*` files that tell contributors how Genfeed beats named competitors.
- If strategy lands here, revert the docs, close the public issue as not planned, and move the write-up to `genfeedai/vault`.
- Do not leave a public pointer that restates the strategy. A one-line “lives in vault” note is enough.
