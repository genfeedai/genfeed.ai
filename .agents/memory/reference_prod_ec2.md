---
name: Production EC2 (api.genfeed.ai)
description: Prod box facts — instance, access, deploy mechanics, incident learnings
type: reference
last_verified: 2026-06-10
---

# Production EC2 — api.genfeed.ai

- **Instance**: `i-0ba4418050d90bd32`, name `api.genfeed.ai-al2023`, Amazon Linux 2023, us-west-1.
  **t3a.large (8GB)** since 2026-06-10 (resized from t3a.medium after OOM-thrash incident; ~$55/mo).
- **EIP** `52.52.217.255` (survives stop/start; `api.genfeed.ai` A-record points at it).
- **Access**: SSH `ec2-user@100.101.125.109` (Tailscale IP) with `~/.ssh/wastelanderz.pem`.
  ssh-agent default keys may NOT include it — pass `-i` explicitly. No SSM agent registered.
- **Runs**: 10 server containers (compose `docker/docker-compose.production.yml`, prefix `genfeed-ai-*`) + redis. Deployed via `Deploy Production` workflow → SSH → `docker/deploy-production.sh` (waves, health-gated, auto-rollback).
- **Deploys**: GitHub release (`v*` tag) triggers `Deploy Production` with force_all; `workflow_dispatch` for hotfixes. First release: v0.1.0 (2026-06-10).
- **Env**: SSM Parameter Store `/genfeed/production/*` → rendered to `.env.production` on deploy. `NODE_EXTRA_CA_CERTS=/certs/rds-ca.pem` — image bakes the RDS CA bundle (since #515).
- **DNS gotcha**: host resolv.conf is owned by Tailscale MagicDNS (`100.100.100.100`); after the 2026-06-10 reboot it SERVFAIL'd all public names (breaks ghcr pulls + outbound). Fixed via `sudo tailscale set --accept-dns=false` + tailscaled restart. If host DNS dies again, check tailscaled first.
- **NEVER bulk-restart the containers** (`docker restart` xN). Boot spikes from simultaneous NestJS starts OOM-thrashed the old 4GB box for 45 min (no swap on AL2023, `restart: unless-stopped` flywheel). Restart in waves like the deploy script, sleep ~30s between.
- **Vercel frontends**: `genfeed.ai` + `docs.genfeed.ai` projects re-linked to the new repo (auto-deploy on master). `app.genfeed.ai`, `admin.genfeed.ai`, `chatgpt`, `marketplace` projects still wired to the dead `cloud` repo / stale `apps/web/*` root dirs as of 2026-06-10 — workflow Vercel jobs fail until dashboard settings are fixed.
