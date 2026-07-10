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
- REST API with OpenAPI documentation, typed client packages, and an MCP server
- PostgreSQL persistence via Prisma and Redis/BullMQ background work
- Community Docker distribution that excludes commercial `ee/` source

Availability can differ by deployment mode and configured provider. See
[Deployment Modes](docs/deployment-modes.md) and
[Execution Boundaries](docs/execution-boundaries.md) before relying on a feature
for a specific distribution.

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
