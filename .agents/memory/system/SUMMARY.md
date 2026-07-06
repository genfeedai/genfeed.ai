# Genfeed.ai System Summary

Project planning/reporting summary.

## Key References

- Architecture: `./ARCHITECTURE.md`
- Rules: `./RULES.md`
- Agent runtime: `./AGENT-RUNTIME.md`
- Critical rules: `./CRITICAL-NEVER-DO.md`
- Cross-project rules: `./CROSS-PROJECT-RULES.md`
- Priority reading: `./PRIORITY-READING.md`
- Open-source context: `./OPEN-SOURCE-CONTEXT.md`
- Self-hosted guide: `./SELF-HOSTED-GUIDE.md`

## Repo Layout

```
apps/
  server/     api, discord, files, images, mcp, notifications, slack, telegram, videos, voices, workers
  app/        Next.js studio UI
  website/    Marketing site
  desktop/app/ Electron desktop shell embedding apps/app with local IPC backend actions
  mobile/app/  React Native / Expo
  extensions/  Browser + IDE extensions
packages/     Shared packages (@genfeedai/*)
ee/packages/  Enterprise features (commercial license)
docker/       Self-hosted deployment
docs/         Documentation
```

`apps/server/clips/` exists in the tree but is not currently a Bun workspace or Nest service package.

## Current Desktop Boundary

- `bun dev:desktop` should work by itself from the desktop package/root script.
- Desktop embeds the real `apps/app` Next.js shell and does not require the
  NestJS API for local/offline mode.
- Shared generation logic lives in packages; NestJS exposes it over REST for
  cloud/self-hosted, while Electron main exposes it to `apps/app` over typed IPC.
- First desktop paint is a black Electron boot screen with an animated Genfeed
  mark while the embedded app shell starts.

## Current Website Positioning

- The public website package is `apps/website`; there is no `apps/web` package
  in this repo.
- Public website copy leads with the managed `Cloud App` offer.
- Primary CTA: `Start Cloud App`.
- Secondary CTA: `Book a Demo`.
- Public pricing order: Cloud App (`$8/mo` platform access + PAYG output),
  Cloud Teams (`from $499/mo` + PAYG output), Enterprise, then Self-Hosted Core.
- Internal pricing data still uses the `Hosted` plan label for compatibility;
  public surfaces map that plan to `Cloud App`.
