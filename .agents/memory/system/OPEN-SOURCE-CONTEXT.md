# Open-Source & Enterprise Context

## License Split

- **Root (`/`):** AGPL-3.0 -- all code outside `ee/` is open source.
- **Enterprise (`ee/`):** Commercial license (see `ee/LICENSE`). Multi-tenancy, advanced org controls, and enterprise features.

## Single-Tenant Default

Genfeed.ai is a self-hosted single-tenant application by default. One organization per deployment. No multi-tenant isolation logic is needed for standard self-hosted use.

## Enterprise Multi-Tenancy

Multi-tenant organization controls are a SaaS/EE product boundary. Current source truth after #1093: request auth, request context, and org-scoped query enforcement live in the OSS API because they are deployment-mode-agnostic infrastructure. There is no `ee/packages/multi-tenancy` package on `origin/master`.

**Repo invariant:** do not add a new separable `ee/packages/multi-tenancy` scaffold. Put deployment-mode-agnostic auth/query enforcement in the OSS API and keep product entitlements, billing, quotas, and commercial-only controls in `ee/`.

This means:

- Organization-scoped query enforcement belongs with the OSS API request/auth path unless a concrete commercial-only feature needs an `ee/` adapter
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
- `ee/packages/*` -- enterprise packages, commercial license

## What Stays Open vs Enterprise

| Capability                                  | OSS | Enterprise (`ee/`) |
| ------------------------------------------- | --- | ------------------ |
| Workflow builder + execution                | Yes | --                 |
| BYOK model execution                        | Yes | --                 |
| Agent chat + tools                          | Yes | --                 |
| Skill model + local skills                  | Yes | --                 |
| Routine engine + workflow-backed scheduling | Yes | --                 |
| Personal feedback memory                    | Yes | --                 |
| Single-tenant deployment                    | Yes | --                 |
| Multi-tenant product surface                | --  | Yes                |
| Team/role management                        | --  | Yes                |
| Shared review queue                         | --  | Yes                |
| Org-shared memory + governance              | --  | Yes                |
| Skill promotion from feedback               | --  | Yes                |
| Billing + quotas                            | --  | Yes                |
| Advanced analytics                          | --  | Yes                |
