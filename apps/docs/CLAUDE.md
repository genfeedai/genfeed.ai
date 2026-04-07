# Documentation Site Project

**Nextra-powered documentation site (Next.js).**

Project guidance lives in `AGENTS.md` and `.agents/`. Docs in `.agents/`.

## Tech Stack

- Nextra 4
- Next.js 16 (App Router)
- React 19
- MDX
- Tailwind CSS (via Nextra)

## Commands

```bash
bun install      # Install dependencies
bun run dev      # Local preview on port 3007
bun run build    # Production build (.next output)
bun run start    # Start production server on port 3007
```

## Structure

- `app/layout.tsx` - Root docs layout and theme shell
- `app/[[...mdxPath]]/page.tsx` - Catch-all MDX route
- `content/` - Documentation pages and `_meta.ts` navigation files
- `components/` - Shared React components (for example `SwaggerUI`)
- `public/` - Static assets (favicon)
- `styles/` - Custom CSS

## Docs

- `.agents/README.md` - Project guide
- `.agents/SESSIONS/` - Session logs and template
- `../.agents/` - Workspace-level architecture/rules/SOPs

## Vercel Deployments
NEVER run `vercel` or `vercel deploy` without first confirming `.vercel/project.json` exists.
If it doesn't exist, STOP and ask the user — do not run `vercel link` unattended.

## Learned Rules

<!-- Rules added by Claude after corrections. Promote stable rules (30+ days) to main sections above. -->
