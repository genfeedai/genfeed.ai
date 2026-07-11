---
created: 2026-04-07T00:00:00Z
last_updated: 2026-07-11T00:00:00Z
version: 1.2
author: Claude Code PM System
---

# Project Overview — Genfeed.ai

Genfeed.ai is an open-source AI operating system for content creation — a self-hosted monorepo providing autonomous agent orchestration, multi-platform distribution, workflow automation, and GPU-powered media generation. Enterprise packages live in `ee/` under a commercial license; multi-tenant enforcement is currently shared OSS API infrastructure, while multi-tenancy as a product boundary remains SaaS/EE.

## Key Capabilities

- **AI Agent Orchestration**: Multi-agent content pipelines with specialized agent types (content creator, optimizer, distributor, etc.)
- **Content Engine**: Batch generation, quality scoring, brand memory, and content optimization
- **Multi-Platform Distribution**: 48+ integrations (social media, publishing platforms, ad networks, messaging)
- **Workflow Automation**: Visual workflow builder (React Flow-based) with 43+ node types
- **GPU Pipeline**: Image, video, and voice generation services
- **Desktop & Mobile**: Electron desktop app, React Native / Expo mobile app
- **Browser & IDE Extensions**: Cross-platform extensions for content workflows

## Architecture Summary

- **12 backend service workspaces** (NestJS and server-tier packages): api, discord, files, images, mcp, notifications, server, slack, telegram, videos, voices, workers. `apps/server/clips/` is not currently a package workspace.
- **7 frontend/client workspaces**: app (studio), docs, website, desktop, mobile, browser extension, IDE extension
- **43 shared packages**: serializers, UI components, hooks, services, types, enums, workflow engine, integrations, Prisma, auth client, harness, etc.
- **2 enterprise packages** (`ee/`): billing and harness
- **Infrastructure**: Docker self-hosted, PostgreSQL (Prisma ORM), Redis + BullMQ, Better Auth

## Current State

Migrated and consolidated from separate cloud + core repositories into this single monorepo. CI/CD runs on GitHub Actions. Branch flow: trunk-based — `master` is the single trunk. Assigned GitHub issue work should use isolated worktrees branched from `master`, then PR back to `master`.
