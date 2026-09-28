---
created: 2026-04-07T00:00:00Z
last_updated: 2026-07-11T00:00:00Z
version: 1.2
author: Claude Code PM System
---

# Project Overview — Genfeed.ai

Genfeed.ai is an open-source AI operating system for content creation — a self-hosted monorepo providing autonomous agent orchestration, multi-platform distribution, workflow automation, and GPU-powered media generation. The whole repository is AGPL, billing included; multi-tenant enforcement is shared API infrastructure, while multi-tenancy as a product boundary remains SaaS-only at runtime.

## Key Capabilities

- **AI Agent Orchestration**: Multi-agent content pipelines with specialized agent types (content creator, optimizer, distributor, etc.)
- **Content Engine**: Batch generation, quality scoring, brand memory, and content optimization
- **Multi-Platform Distribution**: 48+ integrations (social media, publishing platforms, ad networks, messaging)
- **Workflow Automation**: Visual workflow builder (React Flow-based) with 43+ node types
- **GPU Pipeline**: Image, video, and voice generation services
- **Desktop & Mobile**: Electron desktop app, React Native / Expo mobile app
- **Browser & IDE Extensions**: Cross-platform extensions for content workflows

## Architecture Summary

- **8 backend service workspaces**: api, discord, files, mcp, notifications, slack, telegram, workers
  (`apps/server/{clips,images,videos,voices}` don't exist as workspaces — see `project-structure.md`;
  `server` is a retired name, enforced by `bun run check:retired-core-names`).
- **7 frontend/client workspaces**: app (studio), docs, website, desktop, mobile, browser extension, IDE extension
- **32 shared packages** (`packages/*`, `@genfeedai/*` scope): serializers, UI components, hooks, services,
  contracts, workflows, integrations, Prisma, auth client, harness, etc.
- **Infrastructure**: Docker self-hosted, PostgreSQL (Prisma ORM), Redis + BullMQ, Better Auth

## Current State

Migrated and consolidated from separate cloud + core repositories into this single monorepo. CI/CD runs on GitHub Actions. Branch flow: trunk-based — `master` is the single trunk. Assigned GitHub issue work should use isolated worktrees branched from `master`, then PR back to `master`.
