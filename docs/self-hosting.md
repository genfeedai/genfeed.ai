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
release manifest and pins `GENFEED_IMAGE_TAG` to the immutable image version
associated with the GitHub release.

The create package performs the same download, checksum, manifest, and Compose
validation automatically:

```bash
npx @genfeedai/create my-genfeed
```

This starts:

- **Web** (port 3000) — Studio UI
- **API** (port 3010) — Core REST API
- **MCP** (port 3014) — local MCP surface
- **PostgreSQL** (port 5432)
- **Redis** — embedded in the Genfeed container and persisted under `/data`

On first boot the container runs Prisma migrations and seeds one local
workspace: one user, one organization, and one brand.

## Source Checkout

Use a source checkout when contributing or when you want the repository's
editable self-hosting configuration:

```bash
git clone https://github.com/genfeedai/genfeed.ai.git
cd genfeed.ai/docker
cp .env.example .env
docker compose --env-file .env -f docker-compose.selfhosted.yml up -d
```

This Compose file still runs a published GHCR image; it does not build the
checked-out source. Unlike a release bundle, the source `.env.example` defaults
to the mutable `latest` image unless you set `GENFEED_IMAGE_TAG` to a published
version explicitly.

## Requirements

- Docker Engine with the Docker Compose plugin, or Docker Desktop
- A runtime capable of running the published `linux/amd64` Community image
  (Docker Desktop can use emulation on Apple Silicon)
- Enough disk space for the application image, PostgreSQL, and generated media

## Community Auth Modes

Community is single-tenant by default. The default `docker/.env` runs without a
login wall:

```env
BETTER_AUTH_ENABLED=false
NEXT_PUBLIC_BETTER_AUTH_ENABLED=false
```

That path needs no Better Auth account, no email provider, no Google OAuth
client, and no cloud service. The seeded workspace opens locally.

To require local sign-in for a team, enable Better Auth in `docker/.env`:

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

## Optional Services

The published Community compose starts the bundled web/API/workers/files/
notifications/MCP services plus Postgres. Optional integrations are configured
with environment variables in `docker/.env`; they are not separate compose
profiles in the Community quick-start file.

## GPU Configuration

Point `GENFEED_GPU_URL` at your ComfyUI instance:

```env
GENFEED_GPU_URL=http://your-comfyui-host:8188
```

## Enterprise Features

Set `GENFEED_LICENSE_KEY` to enable:

- Multi-organization support
- Team management (roles, invites, permissions)
- Billing and credit system
- Cross-brand analytics
- Advanced scheduling

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

Managed Cloud execution requires an explicit Cloud API key on the backend. Do not expose this key to browser code.

```env
GENFEED_API_KEY=gf_...
```

See [Core and Cloud Execution Boundaries](./execution-boundaries.md) for the full V1 contract.
