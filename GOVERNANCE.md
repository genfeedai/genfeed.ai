# Governance

This document describes how decisions are made in the `genfeedai/genfeed.ai`
repository. It is deliberately short: the project has one maintainer, and the
rules below are written so that contributors know exactly who decides what and
how to get a decision changed.

Vocabulary (Maintainer, Contributor, Agent-authored PR, ADR, …) is defined in
[CONTEXT.md](CONTEXT.md).

## Roles

### Maintainer

The **maintainer** has merge and release authority for this repository and is
the final decision-maker on scope, architecture, licensing, and conduct.

Today the maintainer is one person: [@VincentShipsIt](https://github.com/VincentShipsIt)
(Genfeed founder). `.github/CODEOWNERS` routes every review request to the
maintainer.

The maintainer:

- triages issues (or delegates triage to an agent) within 7 days of opening;
- reviews and merges pull requests;
- cuts releases from `master` (see [RELEASING.md](RELEASING.md));
- accepts or rejects architecture decisions, recorded as ADRs;
- enforces the [Code of Conduct](CODE_OF_CONDUCT.md);
- is the only party who may change `LICENSE`, `TRADEMARK.md`, and this file.

### AI review pipeline

Genfeed is an agent-native repository. Pull requests are reviewed by an
automated pipeline (CodeRabbit plus repository-specific agents) **before** the
maintainer reads them, and issues are triaged and rewritten by agents. The
pipeline advises; it does not merge. Every merge is a maintainer decision, and
the maintainer is accountable for it.

Agent-authored contributions from outside are welcome under the same rules as
human contributions: disclose the tooling in the PR body and name the human who
is accountable for the description and verification. See
[CONTRIBUTING.md → Agent-authored PRs](CONTRIBUTING.md#agent-authored-prs).

### Contributors

Anyone who opens an issue, discussion, or pull request is a **contributor**.
Contributors do not need to ask permission to start work, but for anything
larger than a typo or docs fix, open (or find) an issue first so the scope is
agreed before the code exists.

There are no committer, triager, or core-team roles at this time. If the
project grows enough that the maintainer needs help with merge or triage
authority, that change will be made here in an explicit revision — never
implicitly.

## How decisions are made

### Day-to-day

Small decisions (bug fixes, docs, refactors that keep contracts stable) are made
in the PR by the maintainer. Discussion happens on the issue or PR thread, in
public.

### Architecture and product-shape decisions

Anything that changes a public contract, a repository boundary, the declared
stack, or a policy in this document is decided by an **Architecture Decision
Record**:

- ADRs live in `.agents/memory/architecture/ADR-*.md` and are indexed in
  `.agents/memory/MEMORY.md`.
- Format: `Status` · `Decision` · `Trade-off` · `Guardrail`. Keep them short.
- Anyone may propose an ADR in a PR. The maintainer accepts, rejects, or asks
  for changes. An accepted ADR is the decision of record until a later ADR
  supersedes it.
- **The stack is declared, not debated per-PR.** Bun, Turborepo, Next.js,
  React, NestJS, Prisma + Postgres, Redis + BullMQ, Better Auth, Biome, Vitest,
  Playwright, and Docker Compose are the toolchain. Replacing one requires an
  accepted ADR before any code lands.

### Roadmap and priority

Delivery state lives on the public
[GitHub Project #12](https://github.com/orgs/genfeedai/projects/12).
Priority is a native organization Issue Field surfaced on the project, never a
label. There is no committed roadmap and no release cadence — releases ship
from `master` when ready.

### Licensing and boundaries

- The whole repository is AGPL-3.0-or-later.
- Contributions are accepted under a Contributor License Agreement based on the
  FSFE Fiduciary License Agreement 2.1 ([ICLA.md](ICLA.md) / [CCLA.md](CCLA.md)),
  signed once per GitHub account per CLA version via CLA Assistant. A newer
  CLA version applies to future contributions; prior contributions keep prior
  rights. Changing the beneficiary or the outbound-licence obligation would
  still require every past contributor's consent, so that decision is made
  once, here.
- The Genfeed name and logo are trademarks; see [TRADEMARK.md](TRADEMARK.md).

## Changing this document

Governance changes are proposed as a PR that edits this file and, when the
change is a policy decision, adds or amends an ADR. The maintainer decides.
Changes take effect when the PR merges to `master`.

## Contact

- Public: [GitHub Discussions](https://github.com/genfeedai/genfeed.ai/discussions)
- Conduct reports: [support@genfeed.ai](mailto:support@genfeed.ai) with
  `[CONDUCT]` in the subject
- Security: see [SECURITY.md](SECURITY.md)
