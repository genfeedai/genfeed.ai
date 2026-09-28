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

## Billing: one build, a runtime gate

SaaS and community images ship the **same** billing code. Organization
subscription billing lives in the API under
`apps/server/api/src/collections/{subscriptions,user-subscriptions,subscription-attributions}/`
and is AGPL like the rest of the repository — there is no commercial subtree
and no build flavor.

Which implementation is live is decided **at boot**, in
`apps/server/api/src/common/subscriptions/billing.providers.ts`, by
`hasOrganizationBilling()` (SaaS via `GENFEED_CLOUD` / a public `*.genfeed.ai`
URL, or a licensed self-host via `GENFEED_LICENSE_KEY`):

- **Organization billing live** — the shared billing tokens
  (`SUBSCRIPTIONS_SERVICE`, `USER_SUBSCRIPTIONS_SERVICE`,
  `SUBSCRIPTION_ATTRIBUTIONS_SERVICE`) bind the Stripe-backed services and the
  billing controllers are registered.
- **Community self-host** — the tokens bind the colocated community stubs
  (`apps/server/api/src/common/subscriptions/oss-*.service.ts`) and no billing
  routes are registered. Always-on webhook/read paths return domain-safe values;
  user-initiated org billing throws an explicit 403 pointing here. Hosted
  credits go through the managed checkout
  (`/v1/services/stripe/managed/checkout`) instead.

`initializeLicenseVerification()` runs in `main.ts` before the app module is
imported, so reading the gate from `@Module()` metadata is safe — the same
pattern `CreditsModule` uses for `usesMeteredCredits()`. The gate is covered
by `billing.providers.spec.ts`, which asserts the SaaS, community, and
licensed-self-host bindings.

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
  roles. Deployment operators manage `users.platformRole` separately.
- **Product flags are PostHog in SaaS, typed code defaults elsewhere.** There is
  no env JSON of flag values. Community and unsigned Desktop keep Replies
  (`reply_bot`) on with no PostHog call-home; SaaS operators target `reply_bot`
  in PostHog (person = `users.id`, optional `is_internal`). If PostHog is
  absent, a flag takes its default in `FEATURE_FLAG_OFFLINE_DEFAULTS`.

## Product switches

Platform-wide product behaviour is PostHog feature flags evaluated for the
person `genfeed-platform` (#5468); roll each flag out to 100% of that person.
API and workers read them within 15 seconds. Without PostHog, the defaults in
`DEFAULT_PLATFORM_FEATURE_SETTINGS` apply. If PostHog is configured but has not
answered since boot, SaaS uses production's posture (email verification on,
media perception off) until it does.

| Flag | Type | Payload |
| --- | --- | --- |
| `media_perception` | boolean | `{frameCount, lookbackHours, visionModel}` |
| `media_gate_vision` | variant `shadow` / `live` | — |
| `media_text_gate` | variant `shadow` / `live` | `{minConfidence}` |
| `moderation` | variant `shadow` / `live` | `{provider: "none" \| "openai", thresholds: {category: 0..1}}` |
| `agent_auto_routing` | variant `shadow` / `live` | — |
| `model_discovery_decision` | variant `shadow` / `live` | `{minConfidence}` |
| `pattern_analyzer_decision` | variant `shadow` | `{minConfidence}` |
| `reply_bot_intent_decision` | variant `shadow` / `live` | `{minConfidence}` |
| `task_routing_decision` | variant `shadow` | `{minConfidence}` |
| `untrusted_content_decision` | variant `shadow` | `{minConfidence}` |
| `agent_context_compression` | boolean | — |
| `agent_token_streaming` | boolean | — |
| `system_events_recording` | boolean | `{since: "<ISO timestamp>"}` |
| `require_email_verification` | boolean | — |

Once PostHog answers, it is authoritative: an omitted flag is off (PostHog
omits inactive flags), and a disabled variant flag means `off`. Create **all**
flags, including those left at their default (`agent_context_compression` on,
`moderation` / `pattern_analyzer_decision` / `task_routing_decision` at
`shadow`). An answer with none of these flags serves production's posture.
Payload fields left out of an enabled flag take their default. `live` is
refused on the shadow-only decision points.

## See also

- [Self-hosting guide](self-hosting.md)
- [Architecture overview](architecture.md)
- [OSS ↔ Cloud execution boundaries](execution-boundaries.md)
