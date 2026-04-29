# Genfeed.ai System Summary

Project planning/reporting summary.

## Key References

- Architecture: `./ARCHITECTURE.md`
- Rules: `./RULES.md`
- Agent runtime: `./AGENT-RUNTIME.md`
- Critical rules: `./critical/CRITICAL-NEVER-DO.md`
- Cross-project rules: `./critical/CROSS-PROJECT-RULES.md`
- Priority reading: `./critical/PRIORITY-READING.md`
- Open-source context: `./OPEN-SOURCE-CONTEXT.md`
- Self-hosted guide: `./SELF-HOSTED-GUIDE.md`

## Repo Layout

```
apps/
  server/     api, clips, discord, files, images, mcp, notifications, slack, telegram, videos, voices, workers
  app/        Next.js studio UI
  admin/      Admin panel
  website/    Marketing site
  desktop/    Electron desktop shell embedding apps/app with local IPC backend actions
  mobile/     React Native / Expo
  extensions/ Browser + IDE extensions
packages/     Shared packages (@genfeedai/*)
ee/packages/  Enterprise features (commercial license)
docker/       Self-hosted deployment
docs/         Documentation
```

## Current Desktop Boundary

- `bun dev:desktop` should work by itself from the desktop package/root script.
- Desktop embeds the real `apps/app` Next.js shell and does not require the
  NestJS API for local/offline mode.
- Shared generation logic lives in packages; NestJS exposes it over REST for
  cloud/self-hosted, while Electron main exposes it to `apps/app` over typed IPC.
- First desktop paint is a black Electron boot screen with an animated Genfeed
  mark while the embedded app shell starts.
