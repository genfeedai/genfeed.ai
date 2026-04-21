---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-07T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Project Brief — Genfeed.ai

## What It Does

Genfeed.ai is an open-source AI operating system for content creation. It enables individuals, teams, and organizations to generate, optimize, and distribute AI-powered content at scale across 48+ platforms. Users self-host the full stack and bring their own API keys for complete control over their content pipeline.

## Why It Exists

Content creation at scale is operationally complex — coordinating AI generation, quality control, brand consistency, multi-platform publishing, and performance tracking requires significant engineering. Genfeed.ai packages this into a unified, self-hosted studio experience where operators can configure agents, define workflows, and let the system handle execution autonomously — without depending on a third-party SaaS provider.

## Core Value Proposition

- **Autonomous execution**: Agents run content pipelines end-to-end without manual intervention
- **Multi-platform reach**: Single workflow distributes to dozens of platforms simultaneously
- **Brand consistency**: Brand memory and content quality scoring maintain voice and standards
- **Self-hosted sovereignty**: Own your data, your models, your infrastructure
- **Open-source extensibility**: Fork, customize, contribute — no vendor lock-in

## Success Criteria

1. Stable self-hosted deployment via Docker with clear setup documentation
2. Autonomous agent-driven content pipelines working end-to-end
3. Active open-source community contributing integrations and improvements
4. Enterprise adopters using `ee/` features for multi-tenant team operations

## Product Boundary

- **Core (AGPL-3.0)**: Self-hosted, BYOK execution, full feature set for individual and team use
- **Enterprise (`ee/`)**: Multi-tenancy, SSO, billing, analytics, team collaboration (commercial license)
