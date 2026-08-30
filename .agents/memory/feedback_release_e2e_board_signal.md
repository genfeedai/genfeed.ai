---
name: feedback_release_e2e_board_signal
description: Self-hosted release E2E failures must land as native issue Priority P0 and auto-close on green
type: feedback
status: active
last_verified: 2026-08-30
topics: [ci, e2e, release, project-board]
---

**Rule:** A red self-hosted release E2E must open (or update) one `release-e2e` issue, set native issue **Priority = P0** and **Area = Infra**, add it to Project #12, and auto-close that tracker when the suite is green again. Do not leave "Triage to P0" as prose only.

**Why:** #2079 failed three nights in a row (missing public install assets on latest), then recovered, while the board stayed **Backlog with no Priority**. Soft filing makes the board look tidy while the public install contract is broken. P0 is native structured issue metadata, not a label or Status option.

**How to apply:**
- Use `scripts/ci/release-e2e-failure-reporter.mjs` from `.github/workflows/e2e-selfhosted-release.yml`.
- Classify failures (`missing-install-assets`, boot, readiness, playwright).
- Run release E2E on `release: published` as well as nightly schedule.
- Never publish a community release without `genfeed-selfhosted.tar.gz` + `.sha256`; cut via canonical `Release` workflow only.
