# Glossary

Shared vocabulary for this repository. Terms are added as they are resolved; each entry is
the one spelling code, issues, docs, and PRs use. Deployment-mode terms are canonical in
`.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md` and repeated here only for lookup.

## Distribution

**SaaS**: The hosted multi-tenant product at app.genfeed.ai, run by Genfeed. `GENFEED_CLOUD=1`.
_Avoid_: Cloud edition, hosted version, managed Genfeed (as a mode name).

**Community**: The self-hosted, single-org distribution: a checksummed Docker Compose bundle
pinned to a GHCR image, built from this repository without `ee/`. AGPL-3.0-or-later.
_Avoid_: OSS edition, open-source version, self-hosted edition, CE.

**Desktop**: The Electron shell running the same app on a creator's own machine (macOS today).
_Avoid_: local app, offline mode.

**EE**: The commercially licensed `ee/` tree (`ee/LICENSE`) — billing and harness packages —
compiled into SaaS images and excluded from Community.
_Avoid_: enterprise edition, pro, premium.

## Launch milestones

**Contributor-ready**: The first gate. Repository has the legal, documentation, intake, PR, and CI
contracts in place for outsiders to self-host and contribute. Version stays `0.x`. No announcement.
_Avoid_: launch, GA, 1.0.

**Launch**: The second gate. `v1.0.0` Community release plus a public announcement.
_Avoid_: soft launch, beta.

## People

**Maintainer**: The person with merge and release authority. Today one person (solo maintainer),
assisted by an AI review pipeline. Governance is decided by the maintainer and recorded as ADRs.
_Avoid_: core team, committee, owners (as a role name).

**Self-hoster**: Someone who runs Community (or Desktop) and never needs to read the code. The
repository's primary audience.
_Avoid_: end user, customer (reserved for SaaS).

**Contributor**: Anyone outside the maintainer who opens an issue or PR against this repository,
human or agent-driven.
_Avoid_: community member, external dev, outside collaborator (GitHub's term for a role).

**Agent-authored PR**: A pull request whose code was produced by an AI agent. Welcome from
contributors when disclosed in the PR body and a named human is accountable for the description
and verification. Undisclosed agent-authored PRs are closed.
_Avoid_: bot PR, AI slop, generated PR.

## Process

**Stack**: The declared toolchain and framework set (Bun, Turborepo, Next.js, React, NestJS,
Prisma + Postgres, Redis + BullMQ, Better Auth, Biome, Vitest, Playwright, Docker Compose).
Changing an item requires an accepted ADR before code.
_Avoid_: tech choices, dependencies (which means package versions).

**Contributor dev path**: The documented local setup for contributors: fixed ports (`dev:debug*`)
plus `.env.example`, no elevated privileges, macOS or Linux (Windows via Docker/WSL). Distinct
from the maintainer's Portless HTTPS path.
_Avoid_: dev setup (ambiguous), Portless path (maintainer-only).

**EARS acceptance criteria**: Requirement lines in the form `WHEN/WHILE/WHERE/IF … THE SYSTEM
SHALL …`. Required on every issue opened in this repository (bug, feature, task).
_Avoid_: acceptance criteria (unqualified), AC, user story.

**Conventional PR title**: A pull request title in Conventional Commits form
(`type(scope): summary`). Because merges are squash-only, the title becomes the commit subject.
_Avoid_: commit message (contributors do not control the squash commit body).

**DCO sign-off**: The `Signed-off-by:` trailer (`git commit -s`) certifying the Developer
Certificate of Origin. Required on every commit in a contributor PR; checked by the DCO app.
There is no CLA. Contributor PRs may not modify `ee/`.
_Avoid_: CLA, contributor agreement.

**Triage**: The maintainer (or triage agent) reading a new issue, confirming or rewriting its EARS
acceptance criteria, labelling it, and placing it in Project #12. Promised within 7 days of opening.
_Avoid_: grooming, review (reserved for PRs).

**Intake labels**: The public label set applied during triage: `needs:triage` (automatic on open),
`needs:ears`, `needs:info`, `good first issue`, `help wanted`, plus the type label set by the issue
form (`bug`, `enhancement`, `task`). Priority is a Project #12 field, never a label.
_Avoid_: P0/P1 labels, area labels.

**Internal labels**: `shipcode:*` — pipeline state for the maintainer's automation. Visible but
described "internal automation — do not apply". Contributors never set them.

**Fork CI gate**: Workflows on a fork PR run only after a maintainer applies `run-ci` and GitHub
approves the run (approval required for all outside collaborators). Secrets never reach forks.
_Avoid_: CI approval (GitHub's setting alone), trusted contributor.

## Release

**Repo version**: The single semver in the root `package.json`, tagged `v<version>`, naming the
Community bundle. `v1.0.0` marks Launch. npm packages (`@genfeedai/create`, …) and Desktop
(`desktop-v*`) version independently.
_Avoid_: app version, bundle version, product version.

**Changelog**: `CHANGELOG.md` generated by git-cliff from conventional commits inside the release
workflow; the same section is the GitHub Release body. Never hand-edited.

**Security report**: A vulnerability sent through GitHub private vulnerability reporting (preferred)
or `support@genfeed.ai` with `[SECURITY]`. Acknowledged within 72 hours; fix or disclosure within
90 days.
_Avoid_: security issue (public issues are refused for vulnerabilities).

**Upgrade note**: The section in a release body that names a breaking change for self-hosters and
its Prisma migration. Before `v1.0.0` breaking changes are allowed but every one carries an
Upgrade note; from `v1.0.0` semver is strict. Releases ship from `master` when ready — no schedule.
_Avoid_: migration guide (reserved for docs), breaking-change label.

## Docs and brand

**Repository docs**: `docs/` — self-hosting, deployment modes, architecture, contributing. For
contributors and self-hosters. Product and API documentation lives on docs.genfeed.ai; each side
links the other.
_Avoid_: wiki (disabled), handbook.

**Trademark policy**: `TRADEMARK.md` — the Genfeed name and logo are trademarks; forks and hosted
derivatives may not present as official Genfeed. AGPL grants code rights, not brand rights.
_Avoid_: brand guidelines (design-system term).
