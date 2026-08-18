# Open-Source & Cloud Context

## License

The whole repository is AGPL-3.0-or-later — billing included. There is no commercial
subtree and no `ee/` directory. Cloud-only behaviour is a **runtime** boundary
(`hasOrganizationBilling()`, deployment mode), never a license or build-flavor boundary.
See `architecture/ADR-DEPLOYMENT-MODES.md` and `docs/deployment-modes.md`.

## Single-Tenant Default

Genfeed.ai is a self-hosted single-tenant application by default. One organization per deployment. No multi-tenant isolation logic is needed for standard self-hosted use.

## Multi-Tenancy Is a SaaS Product Boundary

Multi-tenant organization controls are a SaaS product surface. Request auth, request context, and org-scoped query enforcement live in the API because they are deployment-mode-agnostic infrastructure (#1093). There is no separable multi-tenancy package and none should be added.

This means:

- Organization-scoped query enforcement belongs with the API request/auth path
- Billing, quotas, and team management live in the API and are gated by deployment mode/config at runtime
- The core code works with a single implicit organization

## Contribution Model

See `CONTRIBUTING.md` at repo root for contribution guidelines. All contributions land in the one AGPL codebase and follow `CLAUDE.md`.

## Package Scope

- `packages/*` -- shared packages (`@genfeedai/*` scope), open source

## What Is Community vs Cloud

Availability is a deployment-mode feature gate, not a source split.

| Capability                                  | Community | Cloud / SaaS |
| ------------------------------------------- | --------- | ------------ |
| Workflow builder + execution                | Yes       | Yes          |
| BYOK model execution                        | Yes       | Yes          |
| Agent chat + tools                          | Yes       | Yes          |
| Skill model + local skills                  | Yes       | Yes          |
| Routine engine + workflow-backed scheduling | Yes       | Yes          |
| Personal feedback memory                    | Yes       | Yes          |
| Single-tenant deployment                    | Yes       | --           |
| Multi-tenant product surface                | --        | Yes          |
| Team/role management                        | --        | Yes          |
| Shared review queue                         | --        | Yes          |
| Org-shared memory + governance              | --        | Yes          |
| Skill promotion from feedback               | --        | Yes          |
| Organization billing + quotas               | -- (managed credits checkout only) | Yes |
| Advanced analytics                          | --        | Yes          |
