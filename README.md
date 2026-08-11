# Genfeed.ai

**The open-source AI OS for content creation.**

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/genfeedai/genfeed.ai?style=social)](https://github.com/genfeedai/genfeed.ai)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/genfeedai/genfeed.ai?utm_source=oss&utm_medium=github&utm_campaign=genfeedai%2Fgenfeed.ai&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

> [!WARNING]
> Genfeed is under active development. Features and APIs can change between releases.

Genfeed is a full-stack platform for building AI-assisted content workflows. The
repository contains a self-hosted Community distribution, the hosted web product,
and source workspaces for desktop, mobile, browser, and IDE clients.

## Distribution status

| Surface               | What this repository ships                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud**             | The hosted web and server source plus deployment automation. Operational availability and account plans are managed outside this repository.                                  |
| **Community**         | Release automation for a checksummed Compose bundle pinned to a GHCR image. It runs a single-tenant web app, REST API, MCP server, PostgreSQL, and embedded Redis.            |
| **Desktop**           | A macOS-first Electron client. The release workflow builds signed macOS DMG/ZIP artifacts from `desktop-v*` tags; this repository does not claim Windows or Linux installers. |
| **Mobile**            | Expo/React Native source. `eas.json` marks the client disabled/not actively developed; the dormant build workflow is not evidence of an App Store or Google Play release.     |
| **Browser extension** | Chrome extension source plus build and Chrome Web Store submission automation. No public store listing is linked here.                                                        |
| **IDE extension**     | VS Code extension source plus a manual CI workflow that packages a VSIX artifact. There is no marketplace publishing workflow.                                                |

## Shipped capabilities

- Visual workflow authoring and local/BYOK execution
- Image, video, text, voice, and audio provider adapters
- Content library, brand, scheduling, and publishing modules
- REST API with OpenAPI documentation, typed client packages, an MCP server, and
  a terminal CLI
- PostgreSQL persistence via Prisma and Redis/BullMQ background work
- Community Docker distribution that excludes commercial `ee/` source

Availability can differ by deployment mode and configured provider. See
[Deployment Modes](docs/deployment-modes.md) and
[Execution Boundaries](docs/execution-boundaries.md) before relying on a feature
for a specific distribution. Organization billing in particular is gated twice
— at build time (the community image contains no `ee/` billing code) and at
runtime (`GENFEED_CLOUD` / EE license); the
[build flavors section](docs/deployment-modes.md#build-flavors-how-billing-code-gets-into-or-stays-out-of-an-image)
explains both gates and the guards that keep them honest.

## Agent integration

Genfeed is drivable by an AI agent, not only by the web app, and the agent
surface covers the full loop rather than read-only reporting: the same
connection that generates an image, video, or article can also draft a post,
schedule a release, and publish it to a connected account. Writes are bounded by
API-key scopes and, on MCP, by a human approval gate.

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
same endpoint at `http://localhost:3014/mcp`.

### Use the CLI

```bash
bun add -g @genfeedai/cli
gf login
gf generate image "product shot on a concrete plinth"
gf publish <ingredientId> --platforms instagram,linkedin
```

`gf login` runs a browser PKCE flow against Genfeed Cloud; `gf login -k gf_live_xxx`
covers CI, containers, agent runtimes, and self-hosted deployments.

### Call the API directly

The API is REST/OpenAPI and takes the same bearer key:

```bash
curl -H "Authorization: Bearer $GENFEED_API_KEY" https://api.genfeed.ai/v1/brands
```

`@genfeedai/api-types` publishes types and Zod schemas generated from the
OpenAPI document; `@genfeedai/client` publishes the shared request/response
models. Neither package is an HTTP client — both are typing layers over your own
`fetch`.

## Community quick start

Prerequisites: Docker Engine with Docker Compose v2, or Docker Desktop.

```bash
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz.sha256
sha256sum -c genfeed-selfhosted.tar.gz.sha256
tar -xzf genfeed-selfhosted.tar.gz
cd genfeed-selfhosted-v*
cp .env.example .env
docker compose --env-file .env -f compose.yml up -d
```

On macOS, replace the checksum command with
`shasum -a 256 -c genfeed-selfhosted.tar.gz.sha256`.

The release bundle pins the image associated with its GitHub release, applies
Prisma migrations, and seeds one local user, organization, and brand. The
default configuration has no login wall and does not require a Genfeed Cloud or
Better Auth account.

Alternatively, the create package downloads and verifies the same bundle:

```bash
npx @genfeedai/create my-genfeed
```

| Surface    | Local URL               |
| ---------- | ----------------------- |
| Web UI     | `http://localhost:3000` |
| REST API   | `http://localhost:3010` |
| MCP server | `http://localhost:3014` |

Add your own provider key to `.env` when you want to run generation. See
the [self-hosting guide](docs/self-hosting.md) for auth, provider, and update
configuration.

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
ee/packages/              Commercial billing and harness packages
docker/                   Community and hosted image definitions
```

## Enterprise boundary

The current `ee/` tree contains the commercial billing provider package and an
enterprise harness package. It is covered by [its own commercial license](ee/LICENSE)
and excluded from the Community image. Broader Cloud/Enterprise product
boundaries are documented in [Architecture](docs/architecture.md); those
boundaries are not a claim that every listed product capability is implemented
inside `ee/` today.

## Development and contribution

Development requires Node.js 24, Bun 1.3.14, and the local dependencies for the
workspace you change. Start with [CONTRIBUTING.md](CONTRIBUTING.md); it contains
the supported setup, focused verification commands, and pull-request process.

Security reports should follow [SECURITY.md](SECURITY.md), not a public issue.

## License

- Repository default: [GNU Affero General Public License v3.0 or later](LICENSE)
- Code under `ee/`: [Genfeed commercial license](ee/LICENSE)

Independently published packages and skills may declare their own license in
their package metadata.

## Links

- [Website](https://genfeed.ai)
- [Documentation](https://docs.genfeed.ai)
- [Hosted app](https://app.genfeed.ai)
- [Issues](https://github.com/genfeedai/genfeed.ai/issues)
