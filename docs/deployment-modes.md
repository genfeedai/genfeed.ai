# Deployment Modes

Genfeed runs in **three modes** from one codebase. This is the contributor-facing
summary; the canonical, decision-of-record version is the ADR at
[`.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md`](../.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md).

## The three modes

| | **SaaS** | **Community** | **Desktop** |
|---|---|---|---|
| **For** | Customers using the hosted product | Self-hosters running the whole stack | Solo creators on their own machine |
| **Get it** | app.genfeed.ai | `docker compose -f docker-compose.selfhosted.yml up` | Download the installer |
| **Orgs** | many (isolated tenants) | **one** | one |
| **Brands** | many per org | **many** | many |
| **Auth** | Better Auth (email/password, magic link, Google) | Better Auth, self-hostable — none for solo, optional login wall | local-first sign-in |
| **Storage** | S3 | local filesystem | local (PGlite) + optional cloud sync |
| **Generation** | managed | your own provider keys (BYOK), free | BYOK local, free |
| **Managed inference** | included | buy cloud credits, use via API | buy cloud credits, use via API |

## Choosing a mode (env)

- **SaaS** — `GENFEED_CLOUD=1` (+ Better Auth, AWS, Stripe).
- **Community** — leave `GENFEED_CLOUD` unset. The default
  `docker/.env.example` runs single-user with no auth and seeds one workspace.
  Turn on a login wall with `BETTER_AUTH_ENABLED=true` and
  `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` in `docker/.env` when a team needs
  local accounts. It is still one org, fully self-hostable, and does not require
  a Better Auth cloud account.
- **Desktop** — the Electron shell sets `NEXT_PUBLIC_DESKTOP_SHELL=1`.

## Key rules

- **Brand is the content context.** You always pick a brand to create content, so
  the **brand switcher is shown in every mode**. The **org switcher only appears
  in SaaS**, where there are multiple tenants to switch between.
- **Single-tenant by default.** Community and Desktop are one org. Multi-tenant
  isolation (many orgs in one deployment) is a SaaS/Enterprise feature.
- **BYOK is always free.** Bring your own provider keys and generate at no cost to
  Genfeed.
- **Managed inference is cloud-only.** To have Genfeed run the models for you, buy
  credits on the cloud and use the issued API key against the cloud
  `/v1/managed-inference` endpoint. A self-hosted instance does not sell credits
  locally.

## See also

- [Self-hosting guide](self-hosting.md)
- [Architecture overview](architecture.md)
- [OSS ↔ Cloud execution boundaries](execution-boundaries.md)
