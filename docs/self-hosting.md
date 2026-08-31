# Self-Hosting Genfeed.ai

## Quick Start

```bash
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz.sha256
sha256sum -c genfeed-selfhosted.tar.gz.sha256
tar -xzf genfeed-selfhosted.tar.gz
cd genfeed-selfhosted-v*
cp .env.example .env
docker compose --env-file .env -f compose.yml up -d
```

On macOS, verify with
`shasum -a 256 -c genfeed-selfhosted.tar.gz.sha256`. The bundle includes a
manifest and pins the exact image version associated with its GitHub release.

The create package performs the same download, checksum, manifest, and Compose
validation automatically:

```bash
npx @genfeedai/create my-genfeed
```

This starts:

- **Web** (port 3000) — Studio UI
- **API** (port 3010) — Core REST API
- **MCP** (port 3014) — local MCP surface, served at `http://localhost:3014/mcp`
  ([Agent Surface](./agent-surface.md)). The endpoint still requires
  `Authorization: Bearer <gf_... API key>` when the web login wall is off;
  see [Local MCP authentication](#local-mcp-authentication).
- **PostgreSQL** (internal container port 5432; not published to the host)
- **Redis** — embedded in the Genfeed container and persisted under `/data`

On first boot the container runs Prisma migrations and seeds one local
workspace: one user, one organization, and one brand.

## Source Checkout

Contributors can inspect and edit the repository's Compose configuration:

```bash
git clone https://github.com/genfeedai/genfeed.ai.git
cd genfeed.ai/docker
cp .env.example .env
docker compose --env-file .env -f docker-compose.selfhosted.yml up -d
```

This still runs the published GHCR image; it does not build the checked-out
source. Unlike a release bundle, the source template defaults to the mutable
`latest` tag unless `GENFEED_IMAGE_TAG` is set explicitly.

## Requirements

- Docker Engine with the Docker Compose v2 plugin, or Docker Desktop
- A runtime capable of running the published `linux/amd64` image (Docker Desktop
  can use emulation on Apple Silicon)
- Disk capacity for the application image, PostgreSQL, and generated media

## Community Auth Modes

Community is single-tenant by default. The default installation `.env` runs without a
login wall:

```env
BETTER_AUTH_ENABLED=false
NEXT_PUBLIC_BETTER_AUTH_ENABLED=false
```

That path needs no Better Auth account, no email provider, no Google OAuth
client, and no cloud service. The seeded workspace opens locally.

To require local sign-in for a team, enable Better Auth in `.env`:

```env
BETTER_AUTH_ENABLED=true
NEXT_PUBLIC_BETTER_AUTH_ENABLED=true
BETTER_AUTH_URL=http://localhost:3010
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
# Optional: leave empty to let the entrypoint generate and persist /data/.better-auth-secret
BETTER_AUTH_SECRET=
```

Email/password works with only the local Better Auth database. Add an email
provider only for magic links, password reset, email verification, or member
invites:

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=updates@example.com
RESEND_REPLY_TO_EMAIL=support@example.com
```

Google sign-in is also optional. If enabled, use the API auth callback as the
Google OAuth redirect URI:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Local redirect URI:

```text
http://localhost:3010/v1/auth/callback/google
```

Production self-host redirect URI:

```text
https://your-api.example.com/v1/auth/callback/google
```

Better Auth runs inside your Genfeed API against your Postgres database. A
Better Auth dashboard/API key is optional and not required for Community.

## Publishing-provider OAuth

To connect social, video, creator, or advertising accounts, create the
provider-side applications and register the callbacks documented in the
[OAuth provider provisioning runbook](./integrations/oauth-provider-provisioning.md).
Unconfigured providers fail closed; they are not required to run Community.

## Local MCP authentication

Turning off the login wall (`BETTER_AUTH_ENABLED=false`) does **not** disable
MCP authentication. `apps/server/mcp` still requires
`Authorization: Bearer <gf_... API key>` on `/mcp`. Missing or invalid tokens
return JSON-RPC `-32001` with a `WWW-Authenticate` header.

The Community seed creates organization slug `default`
(`apps/server/api/src/seeds/self-hosted-seed.service.ts`). After the stack is
up:

1. Open `http://localhost:3000/default/~/settings/api-keys`.
2. Create a Genfeed API key and pick the **MCP** preset.
3. Copy the key once. Export it in the **MCP client** environment (your shell,
   Claude Code, or Codex). Do not put this user key in the Genfeed container
   `.env` — that file's `GENFEED_API_KEY` is the optional Cloud execution key,
   a different secret.
4. Point the client at `http://localhost:3014/mcp`.

```bash
export GENFEED_API_KEY=gf_live_xxx
claude mcp add --transport http genfeed --scope user http://localhost:3014/mcp --header "Authorization: Bearer $GENFEED_API_KEY"
```

Codex equivalent: set `url = "http://localhost:3014/mcp"` and
`bearer_token_env_var = "GENFEED_API_KEY"` so the key stays in the environment
instead of the config file.

For the CLI against the same deployment, inject the key and the local API URL
and run the command directly — do not pass the key as a `-k` / `--key` flag:

```bash
export GENFEED_API_KEY=gf_live_xxx
export GENFEED_API_URL=http://localhost:3010/v1
gf whoami
```

`gf login -i` is the interactive alternative when you want to paste the key at
a hidden prompt. See [Agent Surface](./agent-surface.md) for scopes, the
approval gate, and why `posts:approve` is not `resolve_approval`.

## Optional Services

The published Community compose starts the bundled web/API/workers/files/
notifications/MCP services plus Postgres. Optional integrations are configured
with environment variables in `.env`; they are not separate compose
profiles in the Community quick-start file.

Self-hosters who configure `FAL_API_KEY` can synchronize reviewed Fal schemas
and account pricing through the weekly worker job or the protected
[one-shot operator command](./operations/fal-model-sync.md).

## Optional ComfyUI Configuration

The Community image does not start the separate GPU service workspaces. For
supported API flows that call a local ComfyUI instance, configure:

```env
FLEET_COMFYUI_URL=http://your-comfyui-host:8188
```

## Organization Billing

Organization billing code ships in the same image as everything else — there
is no separate commercial build. Whether it is live is decided at runtime by
`hasOrganizationBilling()`: Cloud detects itself via `GENFEED_CLOUD` or a
`*.genfeed.ai` public URL, and a licensed self-host opts in by setting
`GENFEED_LICENSE_KEY`. A stock Community install without that key gets no-op
billing stubs and no billing routes. See
[Billing: one build, a runtime gate](./deployment-modes.md#billing-one-build-a-runtime-gate).

## Connect to Genfeed Cloud

Self-hosted instances can run without a Genfeed Cloud account. Cloud login and
local login are separate unless you implement an explicit handoff or API
integration.

Better Auth keys configure authentication for this deployment when the local
login wall is enabled:

```env
NEXT_PUBLIC_BETTER_AUTH_ENABLED=true
BETTER_AUTH_SECRET=replace_with_a_long_random_secret
```

Managed Cloud execution requires an explicit Cloud API key on the backend. Do
not expose this key to browser code.

```env
GENFEED_API_KEY=gf_...
```

See [Core and Cloud Execution Boundaries](./execution-boundaries.md) for the full V1 contract.
