# Deployment Modes

Genfeed runs in **three modes** from one codebase. This is the contributor-facing
summary; the canonical, decision-of-record version is the ADR at
[`.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md`](../.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md).

## The three modes

|                       | **SaaS**                                                                     | **Community**                                                   | **Desktop**                                                                        |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **For**               | Customers using the hosted product                                           | Self-hosters running the whole stack                            | Solo creators on their own machine                                                 |
| **Get it**            | app.genfeed.ai                                                               | Download the checksummed GitHub release bundle                  | Build from source; tagged macOS artifacts appear in GitHub Releases when published |
| **Orgs**              | many (isolated tenants)                                                      | **one**                                                         | one                                                                                |
| **Brands**            | many per org                                                                 | **many**                                                        | many                                                                               |
| **Auth**              | Better Auth (email/password, magic link, Google)                             | Better Auth, self-hostable — none for solo, optional login wall | none for local/offline work; Better Auth for explicit Cloud connection             |
| **Storage**           | S3                                                                           | local filesystem                                                | local (PGlite) + optional cloud sync                                               |
| **Generation**        | managed                                                                      | your own provider keys (BYOK), free                             | BYOK local, free                                                                   |
| **Managed inference** | credit-backed managed providers; included credits depend on the current plan | buy cloud credits, use via API                                  | buy cloud credits, use via API                                                     |

## Choosing a mode (env)

- **SaaS** — `GENFEED_CLOUD=1` (+ Better Auth, AWS, Stripe).
- **Community** — leave `GENFEED_CLOUD` unset. The release bundle's default
  `.env.example` runs single-user with no auth and seeds one workspace. Turn on
  a login wall with `BETTER_AUTH_ENABLED=true` and
  `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` in the installation `.env` when a team
  needs local accounts. A repository source checkout uses `docker/.env` instead.
  Community is still one org and does not require a Better Auth cloud account.
- **Desktop** — the Electron shell sets `NEXT_PUBLIC_DESKTOP_SHELL=1`. The
  current release workflow packages macOS only; this repository does not claim
  Windows or Linux installers.

Code must read these axes through `@genfeedai/config/deployment`; direct mode
checks against the environment are rejected by the architecture guard. Boolean
mode flags accept trimmed, case-insensitive `1` or `true` values.

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
- **SaaS admin access is a platform role.** `/admin` is gated by
  `users.platformRole = 'SUPERADMIN'`, separate from organization owner/admin
  roles. See [Platform Admin Role](platform-admin-role.md).

## See also

- [Self-hosting guide](self-hosting.md)
- [Architecture overview](architecture.md)
- [OSS ↔ Cloud execution boundaries](execution-boundaries.md)
