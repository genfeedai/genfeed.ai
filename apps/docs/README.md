# Genfeed Documentation Site (`docs.genfeed.ai`)

Nextra-powered documentation site built on Next.js.

## Last Verified

- **Date:** 2026-08-12
- **Implemented state source:** local docs content + local repo architecture
- **Delivery state source:** GitHub issues/projects

## Responsibilities

- Document current platform behavior and setup paths.
- Reflect architecture reality without relying on stale assumptions.
- Separate implemented behavior from planned/project-tracked work.

## Local Development

```bash
bun install
bun run dev    # http://localhost:3001
```

## Build

```bash
bun run build
bun run start  # :3001
```

## Content Policy

1. Prefer code-verified statements over aspirational copy.
2. When roadmap status is relevant, include delivery-state notes.
3. Do not reference non-existent tracker files (e.g., missing local TODO files).
4. Keep pricing, app counts, and product claims synced with `cloud` and workspace docs.
5. Keep user-facing integration setup in `content/integrations`; root `docs/`
   remains for contributor architecture, migrations, and operational runbooks.
6. Treat `.agents/memory` specs and decisions as implementation records, not
   substitutes for published product documentation.

## Integration Documentation Contract

`content/integrations` is the canonical source for integration guides published
to docs.genfeed.ai. The coverage test in
`tests/integration-docs-coverage.test.ts` verifies that:

- every server integration directory is classified in the adapter inventory;
- every organization BYOK provider is present in the AI-provider guide; and
- every credential-platform registry value is present in the channel catalog.

Add or update the relevant user guide in the same change that introduces an
integration, provider, or credential-platform value.

## Canonical Cross-Links

- Workspace hub: `../.agents/README.md`
- Cloud monorepo: `../cloud`
- Core OSS: `../core`
- CLI: `../cli`

Update this README whenever docs scope or governance changes.
