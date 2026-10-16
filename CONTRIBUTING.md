# Contributing to Genfeed.ai

Thanks for your interest in contributing! This guide covers everything you need to make your first contribution, from a 15-minute docs fix to larger maintainer-scoped work.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Your First PR in 15 Minutes](#your-first-pr-in-15-minutes)
- [Full Development Setup](#full-development-setup)
- [Finding Work](#finding-work)
- [Bounties](#bounties)
- [Pull Request Contract](#pull-request-contract)
- [CLA](#cla)
- [Labels](#labels)
- [Community](#community)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Ways to Contribute

- **Docs & typos** — no local setup required beyond a text editor and GitHub.
- **UI polish** — small component fixes, accessibility, copy.
- **Small backend fixes** — isolated bug fixes with a clear repro.
- **Larger features** — look for `help wanted` issues.
- **Triage & review** — help reproduce bugs, review PRs, answer Discussions.

## Your First PR in 15 Minutes

You do **not** need Bun, Docker, Postgres, Redis, or the full dev stack to make your first contribution. Pick one of these fast paths:

### Path A — Docs-only change (no local build)

1. Fork the repo and clone your fork.
2. Edit any file under `docs/`, `README.md`, `CONTRIBUTING.md`, or `SUPPORT.md`.
3. Commit with a conventional message, e.g. `docs: fix typo in setup guide`.
4. Open a PR against `main`. CI runs markdown lint only.

### Path B — UI change with the Portless dev path

The Portless path runs the frontend against the hosted API — no Postgres or Redis needed.
