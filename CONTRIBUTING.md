# Contributing to Genfeed.ai

Contributions to the open-source tree are welcome through pull requests to
`master`, the repository's single trunk. This guide is the contract: how to set
up, how to open an issue, how to open a PR, and what happens after.

Shared vocabulary (Maintainer, Contributor, Community, EARS, CLA, …)
lives in [CONTEXT.md](CONTEXT.md). Who decides what lives in
[GOVERNANCE.md](GOVERNANCE.md).

## Contents

- [Before you start](#before-you-start)
- [Toolchain and supported operating systems](#toolchain-and-supported-operating-systems)
- [Contributor dev path (Portless HTTPS)](#contributor-dev-path-portless-https)
- [Optional debugging path (fixed ports)](#optional-debugging-path-fixed-ports)
- [Opening an issue](#opening-an-issue)
- [Pull-request contract](#pull-request-contract)
- [Agent-authored PRs](#agent-authored-prs)
- [Contributor License Agreement](#contributor-license-agreement)
- [Focused verification](#focused-verification)
- [Code standards](#code-standards)
- [Repository boundaries](#repository-boundaries)
- [After you open a PR](#after-you-open-a-pr)

## Before you start

- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability — never in a
  public issue.
- Search [existing issues and pull requests](https://github.com/genfeedai/genfeed.ai/issues?q=)
  to avoid duplicate work.
- For anything larger than a typo or docs fix, open (or find) an issue first so
  the scope is agreed before the code exists. See
  [Opening an issue](#opening-an-issue).
- Do not include credentials, `.env` files, customer data, or generated build
  artifacts in commits, issues, or screenshots.
- By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Toolchain and supported operating systems

- Node.js `>=24 <25`
- Bun latest stable (resolved from `.bun-version`; the exact `packageManager`
  value is Turborepo compatibility metadata, not the installer selector)
- Docker Engine with Docker Compose v2, or Docker Desktop, for PostgreSQL and
  Redis (and for the Community distribution)

This is a Bun workspace. Do not use npm, Yarn, or pnpm to install repository
dependencies or update `bun.lock`.

**Operating systems.** Development is supported on **macOS and Linux**. On
**Windows, use WSL2** (Ubuntu) and run everything inside the WSL2 filesystem;
native Windows shells are not supported and are not tested in CI. Self-hosting
the Community bundle only needs Docker and works anywhere Docker Compose v2 runs.

## Contributor dev path (Portless HTTPS)

The default contributor path runs the workspaces behind
[Portless](https://github.com/vercel-labs/portless) on trusted local HTTPS.
Portless installs a startup service on `:443` and trusts a local certificate
authority, so setup asks for administrator approval once per machine.

```bash
git clone https://github.com/<your-account>/genfeed.ai.git
cd genfeed.ai
bun install
cp .env.example .env.local
```

Open `.env.local` and set the two values the local Compose file expects
(everything else has a working default for local development):

```env
DATABASE_URL=postgresql://genfeed:genfeed_local@localhost:5432/genfeed
REDIS_URL=redis://localhost:6379
```

Generate the per-workspace env files, start the databases, and apply
migrations:

```bash
bun run env:sync local --prune-legacy
docker compose -f docker/local/docker-compose.yml up -d postgres redis
bun run --cwd packages/prisma db:migrate
```

Set up and verify Portless, then start the app minimum in two terminals:

```bash
bun run dev:setup          # once per machine; idempotent, rerun to repair
bun run dev:doctor         # read-only contract check
bun run dev:backend:min    # api + files + notifications behind Portless
```

```bash
bun run dev:app            # web UI → https://app.genfeed.localhost/
```

Open <https://app.genfeed.localhost/>.

| Command                       | Starts                                    |
| ----------------------------- | ----------------------------------------- |
| `bun run dev:backend:min`     | api + files + notifications (app minimum) |
| `bun run dev:backend`         | Full backend (+ mcp + workers)            |
| `bun run dev:app`             | Product UI via Portless HTTPS             |
| `bun run dev:frontend`        | app + website                             |
| `bun run dev:docs`            | Docs site                                 |
| `bun run dev`                 | Everything                                |

Package model (routed services): package **`dev`** is the Portless entry;
**`dev:process`** is the child process Portless runs (`run-service.ts`);
**`dev:debug`** is the same child on fixed ports without Portless. Linked
worktrees receive branch-prefixed routes automatically. Details:
[docs/local-development-host-migration.md](docs/local-development-host-migration.md).

The self-hosted distribution has a separate container-image path that does not
require local Node.js or Bun. See [docs/self-hosting.md](docs/self-hosting.md).

## Optional debugging path (fixed ports)

Fixed ports are an optional debugging path for contributors who cannot use
Portless. They need no certificate trust or background service and use plain
`http://` origins.

```bash
bun run dev:debug:backend:min      # api :3010, files :3012, notifications :3111
bun run dev:debug:app              # web UI → http://genfeed.localhost:3000
```

Open <http://genfeed.localhost:3000>. `*.localhost` resolves to loopback on
macOS, Linux, and WSL2 without touching `/etc/hosts`. Fixed ports are app
`3000`, API `3010`, files `3012`, workers `3013`, MCP `3014`, and
notifications/websocket `3111` (containers and deployed environments use
`3011`). Service origins are derived automatically at the `dev:debug` boundary;
you do not need to edit them in `.env.local`.

Do not mix Portless routes with fixed-port values in one environment. If
`dev:setup` fails on your machine, use this optional path and mention it in the
PR.

## Opening an issue

Blank issues are disabled. Use one of the forms:

| Form                                                                                          | Title prefix | Label         |
| --------------------------------------------------------------------------------------------- | ------------ | ------------- |
| [Bug report](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml)             | `fix:`       | `bug`         |
| [Feature request](https://github.com/genfeedai/genfeed.ai/issues/new?template=feature.yml)    | `feat:`      | `enhancement` |
| [Task](https://github.com/genfeedai/genfeed.ai/issues/new?template=task.yml)                  | `chore:` …   | `task`        |

Questions and early ideas go to
[Discussions](https://github.com/genfeedai/genfeed.ai/discussions), not issues
(see [SUPPORT.md](SUPPORT.md)).

**Every form requires EARS acceptance criteria.** Write each requirement as a
testable line:

```text
- [ ] WHEN a user opens the brand settings page THE SYSTEM SHALL show the brand's saved voice within 1 s.
- [ ] IF the API key is revoked THEN THE SYSTEM SHALL return 401 and not 500.
- [ ] WHILE a generation is running THE SYSTEM SHALL keep the Stop button enabled.
```

Keywords: `WHEN` (event), `WHILE` (state), `WHERE` (feature/mode), `IF … THEN`
(unwanted condition), always followed by `THE SYSTEM SHALL …`. This repository
is worked by agents as much as by people, and agents need testable requirements
to act. **You will not be bounced for imperfect syntax** — write your best
attempt; triage rewrites weak criteria (label `needs:ears`) rather than closing
the issue.

**What happens next (triage, within 7 days):**

- The issue opens with `needs:triage` (every form applies it on submit). The
  maintainer or a triage agent confirms or rewrites the acceptance criteria,
  applies labels, and places it on
  [Project #12](https://github.com/orgs/genfeedai/projects/12).
- **Priority is a native organization Issue Field surfaced on Project #12, never a label.**
- If you want to work on an issue, say so in a comment. Issues labelled
  `good first issue` and `help wanted` are pre-scoped for outside contributors.

**Intake labels**

| Label | Meaning |
| ----- | ------- |
| `needs:triage` | Applied automatically when any form is submitted. Removed after triage (within 7 days). |
| `needs:ears` | Acceptance criteria need rewriting into testable EARS form. Triage rewrites; the issue is never closed for syntax. |
| `needs:info` | Waiting on the reporter for details. |
| `good first issue` | Pre-scoped for first-time contributors. Small, specified, no architecture decisions. |
| `help wanted` | Maintainer-scoped work that outside contributors can pick up. |
| `bug` / `enhancement` / `task` | Type label set by the matching issue form. |
| `shipcode:*` | Internal automation — do not apply. |

## Pull-request contract

1. Check nobody is already on it: search
   [open pull requests](https://github.com/genfeedai/genfeed.ai/pulls) and the
   issue thread for a claim. Then fork the repository and create a short-lived
   branch from the latest `master`.
2. Make **one focused change**. Aim for **≤ 400 changed lines** excluding
   lockfiles and generated files; split larger work into stacked PRs. This is a
   soft limit — say why when you exceed it.
3. Sign the [CLA](#contributor-license-agreement) once per GitHub account per CLA
   version, when the bot asks. A newer version applies to future contributions;
   prior contributions keep prior rights.
4. Run [focused checks](#focused-verification) for what you changed.
5. Open the PR against `genfeedai/genfeed.ai:master` and fill in the template.

**Title.** Merges are squash-only, so **the PR title becomes the commit
subject** on `master`. Use Conventional Commits:
`type(scope): summary` — `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
`build`, `ci`, `perf`. Lowercase summary, imperative mood, no trailing period,
≤ 72 characters. Add `!` before the colon for a breaking change and describe
it in the body. Individual commit messages inside the PR are not preserved.
The `PR Title` check enforces the shape and runs on fork PRs without waiting
for `run-ci`; the title is also the changelog line (see below), so write it for
a reader of the release notes.

**Linked issue.** Every PR beyond a typo or docs-only fix references an issue:
`Closes #123` when it fully resolves the work, `Refs #123` for context. If you
genuinely have no issue, write `No-Issue` and one sentence why; the maintainer
may ask you to open one before review.

**Body.** The [template](.github/pull_request_template.md) asks for Summary,
Related issue, Scope, Verification, Screenshots (for UI), AI involvement, and a
checklist. Fill it truthfully — it is what review reads first.

**Fork CI.** Workflows on a fork PR do not run automatically. A maintainer
applies the `run-ci` label after a first read, and GitHub additionally requires
approval for every outside collaborator's run. Secrets never reach fork runs, so
jobs that need them are skipped for forks. Include your focused-check output in
the PR body so review is not blocked on CI.

**Review and merge.** An automated review pipeline comments first; the
maintainer decides. Expect a first response within 7 days. Ready-for-review PRs
are the default — mark a PR draft only if you are still working on it.

## Agent-authored PRs

Genfeed is an agent-native repository; a large share of its own code is written
by AI agents under human direction. Agent-authored contributions from outside
are welcome on three conditions:

1. **Disclose it.** Fill the "AI involvement" line in the PR template (which
   tool, roughly what it did — e.g. "Claude Code drafted the implementation and
   tests; I reviewed and edited").
2. **A named human is accountable.** The PR author is responsible for the
   description being accurate and the verification being real. "The agent said
   it passed" is not verification — run the checks and paste the output.
3. **Same rules as everyone.** Signed CLA, conventional title, linked issue,
   scope discipline.

Undisclosed agent-authored PRs are closed when detected. Bulk, low-effort, or
templated PRs (drive-by dependency bumps, mass rewording, unrequested
refactors) are closed without review regardless of authorship.

## Contributor License Agreement

Contributions are accepted under a Contributor License Agreement based on the
FSFE [Fiduciary License Agreement 2.1](https://fsfe.org/activities/fla/): you
grant Genfeed AI, Inc. an exclusive licence to your contribution, receive a
full licence back, keep your moral rights, and Genfeed commits to keep the
Material available under a Free Software / Open Source licence
(AGPL-3.0-or-later today). Rationale:
`.agents/memory/architecture/ADR-CLA-FLA-2-1.md`.

- Contributing as an individual: [ICLA.md](ICLA.md).
- Contributing on behalf of a company or other legal entity: [CCLA.md](CCLA.md).
  Have an authorized representative accept it and list the employees who
  contribute on the entity's behalf.

You sign **once per GitHub account per CLA version**. When you open your first
PR the CLA Assistant bot comments with a link; accept it there and the
`license/cla` check turns green for that PR and every later one under the same
version. A newer CLA version applies to future contributions; prior
contributions keep prior rights. If the CLA text ever changes, the bot asks you
to accept the new version before your next contribution. Commits do not need a
`Signed-off-by:` trailer.

## Focused verification

Use package names from each workspace's `package.json`:

```bash
bunx biome check --write <changed-paths>
bunx turbo run lint --filter=@genfeedai/<workspace>
bunx turbo run type-check --filter=@genfeedai/<workspace>
bunx turbo run test --filter=@genfeedai/<workspace>
```

For a documentation-only change, use targeted Markdown checks when the affected
workspace provides them and always run:

```bash
git diff --check
```

Broad workspace builds and full test suites run in GitHub Actions. In the pull
request, list exactly what you ran and any checks left to CI.

The [CI/CD enforcement matrix](docs/ci-cd-enforcement.md) explains which rules
are enforced by repository code and which remain GitHub administrator settings.

## Code standards

- Keep TypeScript strict; do not introduce `any` or inline shortcut interfaces.
- Use `@genfeedai/*` aliases instead of deep relative imports across packages.
- Keep response serializers in `packages/serializers`.
- Preserve single-tenant Community behavior and organization guards in shared
  API code.
- Match at least three existing examples before introducing a new code pattern.
- New user-visible copy in `apps/app` or shared product packages
  (`packages/ui`, `packages/pages`, `packages/agent`, `packages/contexts`) goes
  through the host app message catalog (`apps/app/messages/en/<namespace>.json`
  + `useTranslations` / `getTranslations`). Do not hoist strings into a
  module-level `COPY` const to satisfy `bun run check:untranslated-strings`.
- Tests are colocated (`*.test.ts` / `*.spec.ts`); write the failing test
  first when fixing a bug.
- Repository-wide conventions that agents and humans both follow are in
  [AGENTS.md](AGENTS.md); the declared stack and how to change it are in
  [GOVERNANCE.md](GOVERNANCE.md).

## Repository boundaries

- `apps/` contains product, server, and client applications.
- `packages/` contains shared packages. Check each package's own metadata for
  its license and public API.
- Managed inference infrastructure, customer model assignments, and Fleet/LoRA
  operations are outside this public repository.
- The Genfeed name and logo are trademarks — see [TRADEMARK.md](TRADEMARK.md).

## After you open a PR

- Automated review comments arrive within minutes; address or rebut them in
  the thread.
- The maintainer applies `run-ci` and approves the workflow run after a first
  read.
- Once CI is green and review is approved, the maintainer adds the PR to the
  `master` merge queue; it squash-merges with your PR title as the commit
  subject after CI passes again on top of the current `master`.
- Merged work ships in the next Community release cut from `master`
  ([RELEASING.md](RELEASING.md)); the generated release notes credit the PR
  by number and title.

Integration utilities live in [packages/integrations](packages/integrations/README.md).
