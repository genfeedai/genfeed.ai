# Self-Hosting Genfeed.ai

## Quick Start

```bash
git clone https://github.com/genfeedai/genfeed.ai.git
cd genfeed.ai/docker
cp .env.example .env
# Edit .env with your DATABASE_URL (PostgreSQL), REDIS_URL, etc.
docker compose up
```

This starts:

- **API** (port 3001) — Core REST API
- **Web** (port 3000) — Studio UI
- **Admin** (port 3100) — Model management, GPU config, system settings
- **Workers** — Background job processing
- **Files** — Media processing
- **Notifications** — WebSocket + real-time
- **PostgreSQL** (port 5432)
- **Redis** (port 6379)

## Optional Services

```bash
# Add bot integrations (Discord, Slack, Telegram)
docker compose --profile bots up

# Add GPU generation services (requires GENFEED_GPU_URL)
docker compose --profile gpu up
```

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

Self-hosted instances can run without a Genfeed Cloud account. Cloud login and local login are separate unless you implement an explicit handoff or API integration.

Better Auth keys configure authentication for this deployment:

```env
NEXT_PUBLIC_BETTER_AUTH_ENABLED=true
BETTER_AUTH_SECRET=replace_with_a_long_random_secret
```

Managed Cloud execution requires an explicit Cloud API key on the backend. Do not expose this key to browser code.

```env
GENFEED_API_KEY=gf_...
```

See [Core and Cloud Execution Boundaries](./execution-boundaries.md) for the full V1 contract.
