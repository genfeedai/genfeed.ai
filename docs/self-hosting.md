# Self-Hosting Genfeed.ai

## Quick Start

```bash
git clone https://github.com/genfeedai/genfeed.ai.git
cd genfeed.ai/docker
cp .env.example .env
# Edit .env with your MongoDB URI, Redis URL, etc.
docker compose up
```

This starts:
- **API** (port 3001) — Core REST API
- **Web** (port 3000) — Studio UI
- **Admin** (port 3100) — Model management, GPU config, system settings
- **Workers** — Background job processing
- **Files** — Media processing
- **Notifications** — WebSocket + real-time
- **MongoDB** (port 27017)
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

Self-hosted instances can optionally connect to Genfeed Cloud for managed GPU compute and team features. Add your Clerk keys to `.env`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```
