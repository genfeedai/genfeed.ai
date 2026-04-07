# Open-Source & Enterprise Context

## License Split

- **Root (`/`):** AGPL-3.0 -- all code outside `ee/` is open source.
- **Enterprise (`ee/`):** Commercial license (see `ee/LICENSE`). Multi-tenancy, advanced org controls, and enterprise features.

## Single-Tenant Default

Genfeed.ai is a self-hosted single-tenant application by default. One organization per deployment. No multi-tenant isolation logic is needed for standard self-hosted use.

## Enterprise Multi-Tenancy

Multi-tenant organization controls are available under commercial license in `ee/packages/`.

**Repo invariant:** All multi-tenant data access code must live under `ee/` or import from `ee/packages/`.

This means:
- Organization-scoped query enforcement for data isolation belongs in `ee/`
- Billing, quotas, and team management belong in `ee/`
- The core OSS code should work with a single implicit organization

## Contribution Model

See `CONTRIBUTING.md` at repo root for contribution guidelines.

Key points:
- OSS contributions go to the root codebase (AGPL-3.0)
- Enterprise features go to `ee/` (commercial license, typically internal)
- All contributions must follow the coding standards in `CLAUDE.md`

## Package Scope

- `packages/*` -- shared packages (`@genfeedai/*` scope), open source
- `packages/workflow-cloud` / `@genfeedai/workflow-cloud` -- Genfeed Cloud integration (open source)
- `ee/packages/*` -- enterprise packages, commercial license

## What Stays Open vs Enterprise

| Capability | OSS | Enterprise (`ee/`) |
|---|---|---|
| Workflow builder + execution | Yes | -- |
| BYOK model execution | Yes | -- |
| Agent chat + tools | Yes | -- |
| Single-tenant deployment | Yes | -- |
| Multi-tenant org isolation | -- | Yes |
| Team/role management | -- | Yes |
| Billing + quotas | -- | Yes |
| Advanced analytics | -- | Yes |
