---
name: Fallow Health
description: Fallow codebase health analysis tool (#83), weekly CI workflow, initial score 72/100
type: project
---

Fallow (github.com/fallow-rs/fallow) — Rust-native static analysis for TS/JS.

**Why:** Monorepo with 8600+ files, 22% dead files, 99 circular deps, 71 unused deps. Needs automated health tracking.

**How to apply:** Workflow at `.github/workflows/codebase-health.yml` runs weekly Monday 9am UTC. It also runs a report-only PR audit for changed code paths. Repo-specific tuning lives in `.fallowrc.json`; operational score/backlog policy lives in `docs/codebase-health.md`.

Initial results (2026-04-05): Score 72/100 (B). Biggest penalties: unused deps (-10), circular deps (-10), dead files (-4.4). A pinned Fallow 2.96.0 local smoke during #83 hardening returned 55.8/C with no node_modules installed, so use the first post-merge weekly CI run with `.fallowrc.json` as the operating baseline.
