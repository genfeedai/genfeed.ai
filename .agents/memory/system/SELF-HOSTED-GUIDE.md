# Self-Hosted Deployment Context

## Overview

Genfeed.ai is designed for self-hosted single-tenant deployment by default. Enterprise multi-tenancy is available via the `ee/` directory under commercial license.

## Deployment Resources

- Docker configuration: `docker/`
- Self-hosting documentation: `docs/self-hosting.md`
- Environment setup: `docker/.env.example` (if present)

This file provides context for AI agents working on deployment-related tasks. It does not duplicate the content in the above resources -- always refer to those files for current configuration details.

## Architecture Notes

- **Single-tenant default:** One organization per deployment. No tenant isolation logic needed outside `ee/`.
- **Enterprise multi-tenancy:** Available via `ee/packages/`. All multi-tenant data access code must live under `ee/` or import from `ee/packages/`.
- **Server apps:** `apps/server/{api,clips,discord,files,images,mcp,notifications,slack,telegram,videos,voices,workers}`
- **Frontend apps:** `apps/{app,admin,website,desktop,mobile}`
- **Database:** MongoDB (single connection for self-hosted, configurable per-service for scale)
- **Queue:** BullMQ via Redis
- **Real-time:** WebSocket via Redis pub/sub

## Key Invariants

1. Self-hosted deployments must work with a single `docker compose up`.
2. All required services must be documented in `docker/` configuration.
3. BYOK (bring your own key) model execution must work without cloud dependencies.
4. No external service dependencies should be hard requirements (social integrations are opt-in).
