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
| **Storage**           | S3                                                                           | local filesystem                                                | Cloud shell by default; opt-in local PGlite + optional cloud sync                  |
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
  Windows or Linux installers. Cloud startup does not initialize PGlite; the
  embedded database starts only after an explicit local-workspace selection.

Code must read these axes through `@genfeedai/config/deployment`; direct mode
checks against the environment are rejected by the architecture guard. Boolean
mode flags accept trimmed, case-insensitive `1` or `true` values.

## Build flavors: how billing code gets into (or stays out of) an image

Deployment mode is a **runtime** axis (`GENFEED_CLOUD`), but organization
billing is also a **build-time** axis. The two must agree, and each is gated
separately:

1. **Build time — which billing fragment is bundled.** The server bundle
   imports its billing DI fragment through `@billing-providers`. The flavor
   resolver plugin in `webpack.base.config.js` points that import at
   `ee/packages/billing/src/billing.providers.ee.ts` when that directory exists
   in the build (`docker/Dockerfile.server`, the SaaS image), and at the OSS
   no-op fragment `apps/server/api/src/common/subscriptions/billing.providers.oss.ts`
   when it does not (`docker/Dockerfile.selfhosted`, the community image, which
   omits `ee/*` entirely). The community image therefore has **no** enterprise
   billing routes or code — not disabled, absent.
2. **Runtime — whether org billing is live.** In an EE-flavored bundle,
   `hasOrganizationBilling()` (SaaS via `GENFEED_CLOUD` / a public
   `*.genfeed.ai` URL, or a self-host EE license) decides whether the shared
   billing tokens bind the real EE services or the OSS stubs.

Sharp edges, learned the hard way (#2748):

- `apps/server/api/tsconfig.json` maps `@billing-providers` to the **OSS**
  fragment. That mapping exists for `tsc` only — the OSS file carries the
  shared fragment types, and type-checking must work without `ee/`. It must
  never decide bundling: `TsconfigPathsPlugin` outranks `resolve.alias` in
  webpack's resolver, so trusting it shipped OSS billing stubs inside the SaaS
  image while every runtime flag was correct — production checkout 403'd with
  "billing is not available" until the flavor resolver plugin made bundling
  independent of tsconfig paths.
- **Guards:** `bun run check:billing-flavor` (CI) asserts resolver-level flavor
  correctness; `docker/Dockerfile.server` fails the image build if the api
  bundle lacks the EE fragment; the OSS stubs themselves throw an explicit 403
  naming this document's fix if a misflavored build ever reaches users.
- A community build that sees `GENFEED_CLOUD=true` still has no EE code to
  bind — user-initiated org billing throws 403 by design, and hosted credits
  go through the managed checkout (`/v1/services/stripe/managed/checkout`)
  instead.

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
- **Product flags are PostHog in SaaS, on by default elsewhere.** Community and
  unsigned Desktop keep Replies (`reply_bot`) on with no PostHog call-home.
  Do not set `FEATURE_FLAG_DEFAULTS` / `NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS` to
  enable Replies — SaaS operators target `reply_bot` in PostHog (person =
  `users.id`, optional `is_internal`). If PostHog is absent, Replies fail open.

## See also

- [Self-hosting guide](self-hosting.md)
- [Architecture overview](architecture.md)
- [OSS ↔ Cloud execution boundaries](execution-boundaries.md)
