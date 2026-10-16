# Contributing to Genfeed.ai

Thanks for your interest in contributing! This guide covers everything you need to make your first contribution, from a 15-minute docs fix to larger maintainer-scoped work.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Community](#community)
- [Your First PR in 15 Minutes](#your-first-pr-in-15-minutes)
- [Finding Work](#finding-work)
- [Bounties](#bounties)
- [Development Setup](#development-setup)
- [Portless Dev Path](#portless-dev-path)
- [PR Contract](#pr-contract)
- [CLA](#cla)
- [Labels](#labels)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Community

**GitHub Discussions is our only community channel.** We deliberately do not run a Discord, Slack, or forum — Discussions keeps everything searchable and linked to the code.

- 💬 [Ask questions & share ideas](https://github.com/genfeedai/genfeed.ai/discussions)
- 🐛 [Report a bug](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml)
- ✨ [Request a feature](https://github.com/genfeedai/genfeed.ai/issues/new?template=feature.yml)
- 🆘 [Support guide](SUPPORT.md)

If you're stuck, open a Discussion before opening an issue — you'll usually get an answer faster.

## Your First PR in 15 Minutes

You do **not** need Bun, Docker, Postgres, Redis, or `env:sync` to make your first contribution. Pick one of these fast paths:

### Path A — Docs fix (5 min)

1. Fork and clone the repo.
2. Find a typo, broken link, or unclear sentence in `README.md`, `CONTRIBUTING.md`, `SUPPORT.md`, or `docs/`.
3. Edit the file directly on GitHub (pencil icon) or locally.
4. Open a PR. No build, no tests, no local infra required.

### Path B — UI copy or styling tweak (10 min)

1. Fork and clone the repo.
2. `bun install` (Bun only — no Docker needed for UI-only work).
3. `bun run dev:web` to start the web app against the hosted dev API.
4. Make your change in `apps/web/`.
5. Run `bun run lint` and `bun run typecheck` before opening a PR.

### Path C — Small backend fix (15 min)

1. Fork and clone the repo.
2. `bun install`
3. `bun run dev:api` to start the API against the hosted dev database.
4. Make your change in `apps/api/`.
5. Run `bun run test --filter <your-package>` before opening a PR.

> **Tip:** Look for issues labelled [`good first issue`](https://github.com/genfeedai/genfeed.ai/labels/good%20first%20issue) — each one lists the exact files to touch and a verification command you can run locally.

## Finding Work

| Label | Best for | Scope |
| --- | --- | --- |
| [`good first issue`](https://github.com/genfeedai/genfeed.ai/labels/good%20first%20issue) | First-time contributors | Small, self-contained, reproducible without private infra |
| [`help wanted`](https://github.com/genfeedai/genfeed.ai/labels/help%20wanted) | Experienced contributors | Larger, maintainer-scoped work |
| [`bounty`](https://github.com/genfeedai/genfeed.ai/labels/bounty) | Anyone | Paid via Algora — see below |

Every `good first issue` includes:
- A clear description of the change.
- File pointers (exact paths).
- A verification step you can run locally (e.g. `bun run test --filter web`).

If an issue references private QA boxes, the Mac Studio verification host, or internal automation lanes (`grok-bot`, `codex:automation`), it is **not** a good first issue — skip it and pick another.

## Bounties

We use [Algora](https://algora.io/genfeedai) to fund well-specified issues. Bounties are attached to issues labelled `bounty`.

**How it works:**

1. Find an open issue labelled [`bounty`](https://github.com/genfeedai/genfeed.ai/labels/bounty).
2. Comment `/attempt` on the issue to signal you're working on it.
3. Open a PR that references the issue (`Fixes #1234`).
4. Once the PR is merged, Algora pays out automatically to your linked account.

Bounties are typically $50–$500 depending on scope. If you're unsure whether an issue qualifies, ask in the issue thread before starting.

## Development Setup

For full-stack work you'll need:

- [Bun](https://bun.sh) ≥ 1.1
- [Docker](https://docs.docker.com/get-docker/) (Postgres + Redis)
- Two terminals
