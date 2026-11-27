# Core and Cloud Execution Boundaries

This is the repository-level V1 boundary reference. The public docs version lives at `apps/docs/content/self-host/architecture.mdx`.

Boundary spec version: v1.4.0.

## Runtime Modes

| Mode                          | Runtime                            | Provider billing                      | Data owner                                                    | Cloud account |
| ----------------------------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- | ------------- |
| Local setup                   | Self-hosted Core                   | Local provider keys                   | Self-hosted database/storage                                  | Not required  |
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

## Desktop Execution

Desktop is a client of Genfeed Cloud or a self-hosted server, not a runtime mode of its own. It has no local mode, database or generation.

- **Generation** from Desktop goes through the server's API, on credits as on the web. The one exception is a local CLI on the user's own plan (Codex images); its result still lands in the cloud Library.
- **Editing** may run on the user's machine, with local tools (ffmpeg, a headless browser, Bun), inside a project folder under `~/.genfeedai/projects`. The cloud Library is the one list of assets: only the final product uploads, one way, and an upload never publishes. Raw footage and intermediates stay on disk and are never synced.
- **Surfaces:** the web app keeps everything. Desktop adds the project folder, the terminal, local agents and local renders. Admin is web only.
- **Agent file access:** an ordinary agent turn gets only Genfeed MCP tools. A workspace agent may use file and shell tools inside one folder the user picked, with the boundary enforced by the operating system. That rule is decided but not in force until #11252 proves the boundary.

Decision record: [`ADR-DESKTOP-SURFACES-AND-AGENT-FILE-ACCESS`](../.agents/memory/architecture/ADR-DESKTOP-SURFACES-AND-AGENT-FILE-ACCESS.md).

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
- Autonomous agent runs (hired agents drafting on schedule, publishing through the same approval gate) run in Core the same as in Genfeed Cloud.
- Shared review queues, org-shared memory, and skill promotion governance are Cloud or Enterprise responsibilities.
- Cloud login does not mutate a self-hosted database unless an explicit import, export, or Cloud API action runs.
- Without a dedicated sync feature, migration is export/import.

## Follow-On Targets

- Auth bootstrap: keep local identity and the implicit single organization authoritative for Core.
- OSS onboarding: represent `server`, `byok`, and `cloud` access modes truthfully.
- Managed inference: require an explicit Cloud API key and Cloud-credit authorization.
- Analytics: Core v1 owns the self-hosted publish -> post analytics -> content-performance loop documented in `apps/docs/content/core-loop/analytics-backbone.mdx`; multi-tenant reporting, billing analytics, and governance remain Cloud/enterprise boundaries.
- Publishing governance, collaborative learning, and team review: keep Cloud/enterprise boundaries explicit.
