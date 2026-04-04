# Genfeed.ai

**The open source AI OS for content creation.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/genfeedai/genfeed.ai?style=social)](https://github.com/genfeedai/genfeed.ai)
[![Discord](https://img.shields.io/discord/placeholder?label=Discord&logo=discord&color=5865F2)](https://discord.gg/genfeedai)

---

## What is Genfeed.ai?

Genfeed.ai is a self-hostable, AI-powered content creation platform. Generate images, videos, voice, music, and text through a visual workflow editor. Schedule and publish to any platform from a single interface. Deploy with Docker in minutes.

## Features

- **AI Content Generation** -- images, video, text, voice, and music via pluggable model providers
- **Visual Workflow Editor** -- 36+ node types built on React Flow; chain generation, transforms, and publishing into reusable pipelines
- **Multi-Platform Publishing** -- Twitter/X, LinkedIn, Instagram, TikTok, YouTube, Discord, Telegram, Slack, Fanvue, and more
- **Scheduling and Automation** -- calendar-based scheduling with cron and event-driven triggers
- **Studio** -- quick-generation interface for one-off content
- **Gallery** -- searchable asset management with tagging and collections
- **Editor** -- video and media composition timeline
- **Desktop App** -- native Electron app for macOS, Windows, and Linux
- **Mobile App** -- React Native / Expo for iOS and Android
- **Admin Panel** -- model management, GPU configuration, system settings
- **API + SDK** -- typed client library for programmatic access
- **Self-Hosted GPU** -- bring your own GPU with ComfyUI integration

## Quick Start

```bash
git clone https://github.com/genfeedai/genfeed.ai.git
cd genfeed.ai/docker
cp .env.example .env
docker compose up
```

The web UI will be available at `http://localhost:3000` and the API at `http://localhost:4000`.

## Architecture

Turborepo + Bun monorepo. NestJS backend split into 12 microservices. Next.js frontend. MongoDB for persistence. Redis + BullMQ for queuing and caching.

```
genfeed.ai/
  apps/
    server/
      api/            -- REST + GraphQL gateway
      files/          -- file storage and processing
      clips/          -- clip extraction and editing
      images/         -- image generation pipeline
      videos/         -- video generation pipeline
      voices/         -- voice and music generation
      workers/        -- background job runners
      mcp/            -- model context protocol server
      notifications/  -- email, push, in-app notifications
      discord/        -- Discord bot integration
      slack/          -- Slack bot integration
      telegram/       -- Telegram bot integration
    web/              -- Next.js studio UI
    admin/            -- admin panel
    desktop/          -- Electron desktop app
    mobile/           -- React Native mobile app
    website/          -- marketing site
    extensions/       -- browser and IDE extensions
  packages/           -- shared packages (@genfeedai/*)
    core/             -- domain logic
    db/               -- database schemas and migrations
    workflows/        -- workflow engine and node definitions
    integrations/     -- platform connectors
    ui/               -- shared component library
    ...               -- 40+ packages
  ee/
    packages/         -- enterprise features (commercial license)
  docker/
    docker-compose.yml
    Dockerfile
```

## Enterprise Features

The `ee/` directory contains features available under a commercial license:

- **Multi-Tenancy** -- isolated organizations with custom domains
- **Teams and Collaboration** -- roles, permissions, shared workspaces
- **Billing** -- usage-based metering and subscription management
- **Branding** -- white-label theming and custom branding
- **SSO** -- SAML and OIDC single sign-on
- **Analytics** -- advanced reporting and content performance dashboards
- **Managed GPU** -- hosted GPU scheduling and auto-scaling

Enterprise features require a license key. Contact [enterprise@genfeed.ai](mailto:enterprise@genfeed.ai) for details.

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on development setup, code standards, and the pull request process.

## License

- **Core** (`/`) -- [AGPL-3.0](LICENSE)
- **Enterprise** (`/ee`) -- [Commercial License](ee/LICENSE)

## Links

- [Website](https://genfeed.ai)
- [Documentation](https://docs.genfeed.ai)
- [Twitter / X](https://x.com/genfeedai)
- [Discord](https://discord.gg/genfeedai)
