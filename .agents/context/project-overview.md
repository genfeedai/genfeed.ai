---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-10T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Project Overview — Genfeed.ai

Genfeed.ai is an open-source AI operating system for content creation — a self-hosted monorepo providing autonomous agent orchestration, multi-platform distribution, workflow automation, and GPU-powered media generation. Enterprise features (multi-tenancy, billing, SSO) live in the `ee/` directory under a commercial license.

## Key Capabilities

- **AI Agent Orchestration**: Multi-agent content pipelines with specialized agent types (content creator, optimizer, distributor, etc.)
- **Content Engine**: Batch generation, quality scoring, brand memory, and content optimization
- **Multi-Platform Distribution**: 48+ integrations (social media, publishing platforms, ad networks, messaging)
- **Workflow Automation**: Visual workflow builder (React Flow-based) with 43+ node types
- **GPU Pipeline**: Image, video, and voice generation services
- **Desktop & Mobile**: Electron desktop app, React Native / Expo mobile app
- **Browser & IDE Extensions**: Cross-platform extensions for content workflows

## Architecture Summary

- **12 backend services** (NestJS): api, clips, discord, files, images, mcp, notifications, slack, telegram, videos, voices, workers
- **6 app surfaces**: app (studio), docs, website, desktop, mobile, extensions
- **~45 shared packages**: serializers, UI components, hooks, services, types, enums, workflow engine, integrations, etc.
- **9 enterprise packages** (`ee/`): multi-tenancy, billing, analytics, SSO, teams, collaboration, scheduling, branding, admin-ee
- **Infrastructure**: Docker self-hosted, MongoDB, Redis + BullMQ, Clerk auth

## Current State

Migrated and consolidated from separate cloud + core repositories into this single monorepo. CI/CD runs on GitHub Actions. Branch flow: `develop` -> `staging` -> `master`. Assigned GitHub issue work should use isolated worktrees branched from `develop`, then PR back to `develop`.
