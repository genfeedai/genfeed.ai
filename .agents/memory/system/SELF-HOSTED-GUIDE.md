# Self-Hosted Deployment Context

## Overview

Genfeed.ai is designed for self-hosted single-tenant deployment by default. Enterprise multi-tenancy is available via the `ee/` directory under commercial license.

## Deployment Resources

- Docker configuration: `docker/`
- Self-hosting documentation: `docs/self-hosting.md`
- Environment setup: `docker/.env.example` (if present)

This file provides context for AI agents working on deployment-related tasks. It does not duplicate the content in the above resources -- always refer to those files for current configuration details.

## Architecture Notes

- **Single-tenant default:** One organization per deployment. Auth/request context still flows through the OSS API guard stack; self-hosted product behavior should not expose org switching as a multi-tenant product surface.
- **Enterprise multi-tenancy:** SaaS/EE product controls belong in `ee/`; deployment-mode-agnostic org guards and query filters live in the OSS API. There is no `ee/packages/multi-tenancy` package on `origin/master`.
- **Server apps:** `apps/server/{api,discord,files,images,mcp,notifications,slack,telegram,videos,voices,workers}`. `apps/server/clips/` is not currently a package workspace.
- **Frontend apps:** `apps/app`, `apps/docs`, `apps/website`, `apps/desktop/app`, `apps/mobile/app`, and `apps/extensions/{browser,ide}/app`
- **Database:** PostgreSQL via Prisma
- **Queue:** BullMQ via Redis
- **Real-time:** WebSocket via Redis pub/sub

## Key Invariants

1. Self-hosted deployments must work with the documented self-host compose command: `docker compose -f docker-compose.selfhosted.yml up`.
2. All required services must be documented in `docker/` configuration.
3. BYOK (bring your own key) model execution must work without cloud dependencies.
4. No external service dependencies should be hard requirements (social integrations are opt-in).
