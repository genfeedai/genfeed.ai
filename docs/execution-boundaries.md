# Core and Cloud Execution Boundaries

This is the repository-level V1 boundary reference. The public docs version lives at `apps/docs/content/core/execution-boundaries.mdx`.

Boundary spec version: v1.3.1.

## Runtime Modes

| Mode                          | Runtime                            | Provider billing                      | Data owner                                                    | Cloud account |
| ----------------------------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- | ------------- |
| Local setup                   | Self-hosted Core                   | Local keys or local GPU services      | Self-hosted database/storage                                  | Not required  |
| Self-hosted BYOK              | Self-hosted Core                   | Organization BYOK keys                | Self-hosted database/storage                                  | Not required  |
| Self-hosted managed execution | Core plus explicit Cloud API calls | Genfeed Cloud credits                 | Local records stay local; Cloud processes the managed request | Required      |
| Genfeed Cloud                 | Genfeed-managed infrastructure     | Genfeed Cloud credits or plan billing | Cloud workspace                                               | Required      |

## Source of Truth

- Core is single-tenant by default. Its local database and storage are authoritative for local users, organizations, brands, workflows, generated assets, and run records.
- Multi-tenant organization management is a SaaS/Enterprise product boundary.
  Deployment-mode-agnostic request context and organization query guards remain
  in the public API.
- Genfeed Cloud is authoritative for Cloud workspaces, team roles, billing, quotas, publishing connections, and managed analytics.
- Cloud signup handoff parameters are onboarding hints. They are not data replication.
- A Cloud API key authorizes explicit Cloud service calls only. It must not be exposed to the browser.

## Workflow and Runtime Package Boundary

- Public workflow contracts, public workflow templates, registry metadata, and generic Comfy-compatible self-hosted helpers live in this repository.
- Customer-specific workflow templates, managed model inventory, customer model assignment, Fleet lifecycle controls, health probes, runtime secrets, and hosted LoRA/customer runtime operations are managed Cloud responsibilities outside the public repository.
- Self-hosted deployments may connect their own ComfyUI, LoRA, or provider infrastructure through configuration. That does not make Genfeed Cloud's managed customer runtime part of Core.

## Execution Contract

Generation should resolve provider access in this order:

1. Organization BYOK credentials.
2. Server-level provider credentials configured on the self-hosted install.
3. Explicit managed Cloud execution when the deployment has a Cloud API key and the operation supports managed inference.

Provider calls should persist the execution source so users can distinguish BYOK, server/hosted, and managed Cloud-credit-backed runs.

## Offline and Login Contract

- Core remains useful without a Cloud account.
- Local setup, workflow authoring, provider configuration, and BYOK execution are local Core responsibilities.
- Skills, local routines, workflow-backed scheduling, and personal feedback memory are local Core responsibilities.
- Shared review queues, org-shared memory, and skill promotion governance are Cloud or Enterprise responsibilities.
- Cloud login does not mutate a self-hosted database unless an explicit import, export, or Cloud API action runs.
- Without a dedicated sync feature, migration is export/import.

## Follow-On Targets

- Auth bootstrap: keep local identity and the implicit single organization authoritative for Core.
- OSS onboarding: represent `server`, `byok`, and `cloud` access modes truthfully.
- Managed inference: require an explicit Cloud API key and Cloud-credit authorization.
- Analytics: Core v1 owns the self-hosted publish -> post analytics -> content-performance loop documented in `apps/docs/content/core-loop/analytics-backbone.mdx`; multi-tenant reporting, billing analytics, and governance remain Cloud/enterprise boundaries.
- Scheduling, publishing governance, collaborative learning, and team review: keep Cloud/enterprise boundaries explicit.
