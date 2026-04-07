# Genfeed Documentation Site (`docs.genfeed.ai`)

Nextra-powered documentation site built on Next.js.

## Last Verified

- **Date:** 2026-03-24
- **Implemented state source:** local docs content + local repo architecture
- **Delivery state source:** GitHub issues/projects

## Responsibilities

- Document current platform behavior and setup paths.
- Reflect architecture reality without relying on stale assumptions.
- Separate implemented behavior from planned/project-tracked work.

## Local Development

```bash
bun install
bun run dev    # http://localhost:3007
```

## Build

```bash
bun run build
bun run start  # :3007
```

## Content Policy

1. Prefer code-verified statements over aspirational copy.
2. When roadmap status is relevant, include delivery-state notes.
3. Do not reference non-existent tracker files (e.g., missing local TODO files).
4. Keep pricing, app counts, and product claims synced with `cloud` and workspace docs.

## Canonical Cross-Links

- Workspace hub: `../.agents/README.md`
- Cloud monorepo: `../cloud`
- Core OSS: `../core`
- CLI: `../cli`

Update this README whenever docs scope or governance changes.
