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
  desktop/    Electron desktop app
  mobile/     React Native / Expo
  extensions/ Browser + IDE extensions
packages/     Shared packages (@genfeedai/*)
ee/packages/  Enterprise features (commercial license)
docker/       Self-hosted deployment
docs/         Documentation
```
