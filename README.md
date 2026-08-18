# Genfeed.ai

**The open-source AI OS for content creation.** Generate images, video, text,
and voice; manage brands and libraries; schedule and publish to your connected
accounts — from the web app, the CLI, or any AI agent over MCP.

[![CI](https://github.com/genfeedai/genfeed.ai/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/genfeedai/genfeed.ai/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/genfeedai/genfeed.ai?label=release)](https://github.com/genfeedai/genfeed.ai/releases/latest)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/genfeedai/genfeed.ai?style=social)](https://github.com/genfeedai/genfeed.ai)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/genfeedai/genfeed.ai?utm_source=oss&utm_medium=github&utm_campaign=genfeedai%2Fgenfeed.ai&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

> [!WARNING]
> Genfeed is `0.x` and under active development. Breaking changes ship with an
> **Upgrade note** in the release body; semver becomes strict at `v1.0.0`.

Self-host it in a minute (**Community**), run it on your Mac (**Desktop**), or
use the hosted product at [app.genfeed.ai](https://app.genfeed.ai) (**SaaS**).
Same code, three deployment modes — see [Deployment Modes](docs/deployment-modes.md).

## Quick start (self-hosted)

Prerequisites: Docker Engine with Docker Compose v2, or Docker Desktop.

```bash
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz.sha256
sha256sum -c genfeed-selfhosted.tar.gz.sha256   # macOS: shasum -a 256 -c …
tar -xzf genfeed-selfhosted.tar.gz && cd genfeed-selfhosted-v*
cp .env.example .env
docker compose --env-file .env -f compose.yml up -d
```

Or let the create package download, verify, and start the same bundle:

```bash
npx @genfeedai/create my-genfeed
```

| Surface    | Local URL               |
| ---------- | ----------------------- |
| Web UI     | `http://localhost:3000` |
| REST API   | `http://localhost:3010` |
| MCP server | `http://localhost:3014` |

The bundle pins the image for its release, applies Prisma migrations, and seeds
one local user, organization, and brand. The default configuration has no login
wall and needs no Genfeed Cloud account. Add a provider key to `.env` when you
want to run generation. Auth, providers, and upgrades:
[self-hosting guide](docs/self-hosting.md).

<!--
Screenshots / GIF: produced at the Contributor-ready gate (#3002).
Place assets under docs/assets/readme/ and reference them here.
-->

## What you get

- Visual workflow authoring with local or bring-your-own-key execution
- Image, video, text, voice, and audio provider adapters
- Content library, brand, scheduling, and publishing modules
- REST API with OpenAPI, typed client packages, an MCP server, and a terminal CLI
- PostgreSQL persistence via Prisma; Redis/BullMQ background work
- A Community Docker distribution built from the same AGPL source as the hosted image

Availability differs by deployment mode and configured provider. Read
[Deployment Modes](docs/deployment-modes.md) and
[Execution Boundaries](docs/execution-boundaries.md) before relying on a feature
for a specific distribution. Organization billing ships in every image and is
gated at runtime (`GENFEED_CLOUD` / self-host licence); the
[billing section](docs/deployment-modes.md#billing-one-build-a-runtime-gate)
explains the gate.

## Distribution status

| Surface               | What this repository ships                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SaaS**              | The hosted web and server source plus deployment automation. Operational availability and account plans are managed outside this repository.                                  |
| **Community**         | Release automation for a checksummed Compose bundle pinned to a GHCR image. It runs a single-tenant web app, REST API, MCP server, PostgreSQL, and embedded Redis.            |
| **Desktop**           | A macOS-first Electron client. The release workflow builds signed macOS DMG/ZIP artifacts from `desktop-v*` tags; this repository does not claim Windows or Linux installers. |
| **Mobile**            | Expo/React Native source. `eas.json` marks the client disabled/not actively developed; the dormant build workflow is not evidence of an App Store or Google Play release.     |
| **Browser extension** | Chrome extension source plus build and Chrome Web Store submission automation. No public store listing is linked here.                                                        |
| **IDE extension**     | VS Code extension source plus a manual CI workflow that packages a VSIX artifact. There is no marketplace publishing workflow.                                                |

## Drive it from an agent

Genfeed is drivable by an AI agent, not only by the web app, and the agent
surface covers the full loop: the same connection that generates an image,
video, or article can draft a post, schedule a release, and publish it to a
connected account. Writes are bounded by API-key scopes and, on MCP, by a human
approval gate.

| Surface          | What it is                                          | Where                                             |
| ---------------- | --------------------------------------------------- | ------------------------------------------------- |
| **MCP server**   | Streamable HTTP endpoint exposing 105 curated tools | `https://mcp.genfeed.ai/mcp` (`apps/server/mcp`)  |
| **CLI**          | `genfeed` / `gf`, 24 command groups                 | [`@genfeedai/cli`](packages/cli)                  |
| **REST API**     | OpenAPI document at `/v1/openapi.json`              | `apps/server/api`                                 |
| **In-app agent** | Product agent exposing 93 curated tools             | `apps/server/api/src/services/agent-orchestrator` |

All four run against the same REST API. Tool availability is decided by one
reviewed catalog, not by endpoint mirroring — see
[Agent Surface](docs/agent-surface.md).

### Connect an MCP client

Create an API key in organization settings or through the guided
[Connect Genfeed](https://app.genfeed.ai/connect) flow, then export it where the
client runs:

```bash
export GENFEED_API_KEY=gf_live_xxx
```

Claude Code:

```bash
claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp --header "Authorization: Bearer $GENFEED_API_KEY"
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.genfeed]
url = "https://mcp.genfeed.ai/mcp"
bearer_token_env_var = "GENFEED_API_KEY"
```

OAuth-capable clients can add `https://mcp.genfeed.ai/mcp` as a custom server
without a manually created key; they discover the authorization server from
`/.well-known/oauth-protected-resource`. A self-hosted deployment serves the
same endpoint at `http://localhost:3014/mcp` and still requires a Bearer API
key even when `BETTER_AUTH_ENABLED=false` — see
[Local MCP authentication](docs/self-hosting.md#local-mcp-authentication).

### Use the CLI

```bash
bun add -g @genfeedai/cli
gf login
gf generate image "product shot on a concrete plinth"
gf publish <ingredientId> --platforms instagram,linkedin
```

`gf login` runs a browser PKCE flow against Genfeed Cloud. `gf login -i` pastes
a key at a hidden prompt. For CI, containers, and agent runtimes, inject
`GENFEED_API_KEY` through the secret environment and run `gf` directly — do not
pass the key as a command-line flag (`-k` / `--key` lands in `process.argv`).

### Call the API directly

```bash
curl -H "Authorization: Bearer $GENFEED_API_KEY" https://api.genfeed.ai/v1/brands
```

`@genfeedai/api-types` publishes types and Zod schemas generated from the
OpenAPI document; `@genfeedai/client` publishes the shared request/response
models. Neither package is an HTTP client — both are typing layers over your own
`fetch`.

## Stack

Declared, not debated per-PR. Each item has a one-line reason; replacing one
requires an accepted ADR **before** code lands (see [GOVERNANCE.md](GOVERNANCE.md)).

| Layer          | Choice                          | Why                                                                                    |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| Runtime + PM   | **Bun** + **Turborepo**         | One toolchain for install, scripts, tests, and bundling; cached task graph across 40+ workspaces |
| Web            | **Next.js 16** + **React 19**   | App Router, RSC, and the same client for SaaS, Community, and Desktop                   |
| API            | **NestJS 11**                   | DI, guards, and modules keep tenancy and auth enforcement uniform across services       |
| Data           | **Prisma 7** + **PostgreSQL**   | One schema, typed queries, migrations shipped with every release                        |
| Queues         | **Redis** + **BullMQ**          | Generation, publishing, and scheduling are background work with retries and priorities  |
| Auth           | **Better Auth**                 | Self-hostable, org-aware, no vendor account required for Community                      |
| Quality        | **Biome**, **Vitest**, **Playwright** | Format+lint in one pass; colocated unit tests; E2E tiers per distribution          |
| Distribution   | **Docker Compose** + GHCR       | Checksummed bundle pinned to an image; same artifact for install smoke and release      |

## Architecture

Genfeed is a Bun/Turborepo monorepo with Next.js clients, NestJS server
workspaces, PostgreSQL/Prisma persistence, and Redis/BullMQ queues.

The server tree contains 11 runnable NestJS workspaces (`api`, `discord`,
`files`, `images`, `mcp`, `notifications`, `slack`, `telegram`, `videos`,
`voices`, and `workers`) plus the shared `@genfeedai/server` library. They are
not all separate processes in every distribution: the Community image bundles
the web app, API, workers, files, notifications, and MCP runtimes into one
container and embeds Redis.

The public API is REST/OpenAPI. GraphQL appears only in outbound integrations
such as Shopify; Genfeed does not ship a public GraphQL gateway.

```text
apps/
  app/                    Next.js product UI
  server/                 NestJS services and shared server library
  desktop/app/            Electron client (macOS-first release path)
  mobile/app/             Expo/React Native client source
  extensions/browser/app/ Chrome extension source
  extensions/ide/app/     VS Code extension source
packages/                 Shared @genfeedai/* packages
docker/                   Community and hosted image definitions
```

More: [Architecture](docs/architecture.md) ·
[Deployment Modes](docs/deployment-modes.md) ·
[Execution Boundaries](docs/execution-boundaries.md).

## How agents work in this repo

This repository is agent-native: most of its code is written by AI agents under
human direction, and it is laid out so an agent can be productive from a cold
clone.

- **[AGENTS.md](AGENTS.md)** and **[CLAUDE.md](CLAUDE.md)** — the operating rules
  every agent (and human) follows: type safety, UI primitives, serializers,
  tenancy filters, commit conventions.
- **[CONTEXT.md](CONTEXT.md)** — the glossary. One spelling per concept, used
  in code, issues, docs, and PRs.
- **`.agents/memory/`** — durable project memory: rules, ADRs
  (`architecture/ADR-*.md`), specs and decisions per issue. `MEMORY.md` is the
  index.
- **`.agents/skills/`** — build/dev skills for working *on* the app.
  **`skills/`** — product/content skills the app *ships*. Never confuse the two.
- **Issues carry EARS acceptance criteria** (`WHEN … THE SYSTEM SHALL …`) so an
  agent can pick one up and know what "done" means. Triage rewrites weak
  criteria; it never bounces.
- **PRs are reviewed by an automated pipeline first**, then by the maintainer,
  who alone merges. Agent-authored PRs from outside are welcome when disclosed —
  see [CONTRIBUTING.md](CONTRIBUTING.md#agent-authored-prs).

## Develop and contribute

Development is supported on macOS and Linux (Windows via WSL2). Node.js 24,
Bun 1.3.14, and Docker for Postgres/Redis:

```bash
bun install && cp .env.example .env.local
bun run env:sync local --prune-legacy
docker compose -f docker/local/docker-compose.yml up -d postgres redis
bun run dev:debug:backend:min      # then, in a second terminal:
bun run dev:debug:app              # → http://genfeed.localhost:3000
```

Everything else — the issue forms, the PR contract (squash + conventional
title + linked issue), the CLA (once per GitHub account per CLA version), and
focused verification — is in [CONTRIBUTING.md](CONTRIBUTING.md). Governance is one maintainer plus an AI
review pipeline: [GOVERNANCE.md](GOVERNANCE.md). Help and questions:
[SUPPORT.md](SUPPORT.md). Security reports follow [SECURITY.md](SECURITY.md),
never a public issue.

## Documentation

- **[`docs/`](docs/) in this repository** — for contributors and self-hosters:
  [self-hosting](docs/self-hosting.md), [deployment modes](docs/deployment-modes.md),
  [architecture](docs/architecture.md), [agent surface](docs/agent-surface.md),
  runbooks.
- **[docs.genfeed.ai](https://docs.genfeed.ai)** — the product and API
  documentation for people using Genfeed.

Each side links the other; neither duplicates the other.

## Cloud boundary

The whole repository, billing included, is AGPL. Cloud/Enterprise product
boundaries (managed credits, multi-tenant organization management) are
deployment-mode features gated at runtime, not a separately licensed subtree;
they are documented in [Architecture](docs/architecture.md). Managed inference
infrastructure and Fleet/LoRA operations live outside this public repository.

## License and trademark

- Code: [GNU Affero General Public License v3.0 or later](LICENSE) — the whole repository
- Contributions: [Contributor License Agreement](CONTRIBUTING.md#contributor-license-agreement)
  (FSFE FLA 2.1: [ICLA.md](ICLA.md) / [CCLA.md](CCLA.md)), signed once per GitHub account
  per CLA version via CLA Assistant. A newer CLA version applies to future contributions;
  prior contributions keep prior rights.
- Name and logo: [TRADEMARK.md](TRADEMARK.md) — the licence covers the code, not the brand

Independently published packages and skills may declare their own license in
their package metadata.

## Links

- [Website](https://genfeed.ai) · [Hosted app](https://app.genfeed.ai) · [Product docs](https://docs.genfeed.ai)
- [Releases](https://github.com/genfeedai/genfeed.ai/releases) · [Project board](https://github.com/orgs/genfeedai/projects/12)
- [Issues](https://github.com/genfeedai/genfeed.ai/issues) · [Discussions](https://github.com/genfeedai/genfeed.ai/discussions)
- [Sponsor](https://github.com/sponsors/genfeedai)
