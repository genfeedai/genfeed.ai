---
name: Multiple accounts per platform per brand
description: One brand may hold many connected accounts on the same platform, each independently addressable for publishing, replies, warmup, and analytics
type: project
---

# Multiple Accounts Per Platform Spec

## Purpose

Let one brand connect and operate more than one account on the same platform — three
TikToks, an EN and a FR Instagram, a founder X account beside the brand X account — with every
account independently addressable for publishing, scheduling, replies, warm-up, and analytics.

Today `CredentialsService.upsertForBrand` keys a credential on `(brandId, organizationId,
platform)`. Connecting a second account on a platform overwrites the first, and the overwrite
lands on the *live* row at connect time — before the provider callback has proven which account
the user actually authorized. This spec replaces the identity key, makes the connect flow
non-destructive, and removes ambiguous platform-only account resolution across the codebase.

## Optimization target

Optimize first for **account identity correctness** at the credential boundary, then for
**non-destructive connect** semantics, then for reuse of the existing per-credential publish,
schedule, and review infrastructure.

A connect attempt SHALL never invalidate an already-working account. When account identity is
ambiguous, the system SHALL fail closed or fan out explicitly — never silently pick a row.

## Interfaces

### Credential identity

- Account identity is `(brandId, platform, externalId)`. `externalId` is the provider's own
  account id, resolved by `updateExternalProfile` during the OAuth callback.
- A partial unique index enforces one live credential per identity:
  `(brandId, platform, externalId) WHERE isDeleted = false AND externalId IS NOT NULL`.
- Credentials with a null `externalId` are *pending* — mid-OAuth, not yet identified, never
  surfaced to the product.

### Connect

- `POST /{platform}/connect` — body unchanged (`{ brandId }`). Behavior changes: it always
  provisions a **fresh pending credential** carrying the OAuth nonce. It never reads, patches,
  or reuses a connected row.
- `CredentialsService.beginOAuthForBrand(brand, userId, platform, fields)` returns
  `{ credential, state }` where `credential` is always newly created.
- `CredentialsService.upsertForBrand` is removed. Its two remaining honest callers become
  `beginOAuthForBrand` (OAuth) and `createPendingForBrand` (API-key / token-paste).

### Verify

- `POST /{platform}/verify` — body unchanged. After tokens are exchanged and
  `updateExternalProfile` resolves `externalId`, the callback calls
  `CredentialsService.reconcileConnectedAccount(credentialId, organizationId)`.
- `reconcileConnectedAccount` SHALL return the surviving credential — either the newly
  identified one, or the pre-existing live credential for that identity with the new tokens
  merged into it.

### Account listing and labels

- `GET /credentials` already returns every credential; the serializer already exposes
  `externalId`, `externalHandle`, `externalName`, `externalAvatar`, `label`, `isConnected`.
  No serializer change.
- `PATCH /credentials/:id` accepts `label` — the operator-facing account name. UI falls back to
  `@externalHandle`, then `externalName`, then the platform label.

### Account resolution helpers

- `CredentialsService.findConnectedAccounts(organizationId, brandId, platform)` returns **all**
  live connected credentials for a platform, ordered by `createdAt`.
- Call sites that act *as* an account SHALL take an explicit `credentialId`, or fan out over
  `findConnectedAccounts`. Resolving a single account from `(brandId, platform)` alone is
  removed from the codebase.

### UI

- The brand Social settings tile renders one row per connected account under the platform
  header, with a persistent **Add another account** action alongside per-account
  **Reconnect** and **Disconnect**.
- The "One {platform} account per brand for now — reconnect replaces the linked profile"
  disclaimer is removed.

## Behavior

- Connect SHALL create a new pending credential row on every invocation, with
  `isConnected: false`, `externalId: null`, and a fresh `oauthState`.
- Connect SHALL reap the caller's own stale pending rows for that `(brandId, platform, userId)`
  whose `updatedAt` is older than the OAuth state TTL, so abandoned flows do not accumulate.
- Verify SHALL patch tokens onto the pending row resolved from the OAuth nonce, exactly as
  today. The nonce lookup is already id-precise and is unchanged.
- After identity resolution, reconcile SHALL:
  - find a live credential with the same `(brandId, platform, externalId)` and a different id;
  - if found, merge the pending row's tokens, granted scopes, and refreshed profile into that
    credential, hard-delete the pending row, and return the survivor — so **reconnecting an
    existing account stays idempotent and preserves its id, posts, warm-up state, and history**;
  - if not found, mark the pending row connected and return it as a **new distinct account**.
- Reconcile SHALL run inside a transaction and SHALL treat a unique-index violation as "another
  request won the race", retrying once as a merge.
- A provider that never yields an `externalId` SHALL leave the credential pending and the verify
  SHALL fail closed with a clear message, rather than creating an unidentifiable account.
- Publishing, scheduling, and review SHALL operate per `credentialId`. `Post.credentialId` and
  `Post.groupId` already carry this; no post-model change.
- Automated publish paths (workflow trend publish, agent-strategy autopilot, workflow content)
  SHALL fan out across every connected account on each requested platform, creating one `Post`
  per credential sharing one `groupId`.
- When a fan-out targets more than one account on the same platform, the posts SHALL be
  generated as **distinct variations** through the existing variation path, not as identical
  copies, because platforms suppress duplicate media and text across sibling accounts.
- Reply-bot platform resolution SHALL require an explicit `credentialId` from the bot config and
  SHALL fail closed when the config predates multi-account and the brand now holds more than one
  account on that platform.
- `findByHandle` SHALL remain handle-keyed and is unaffected; handles are already unique per
  platform.
- Analytics rollups by platform SHALL remain platform-level. Per-account breakdown is served by
  the existing `PostAnalytics.credentialId` join and is not part of this change.

## Non-goals

- Cross-brand account sharing. A credential belongs to exactly one brand.
- A new posting scheduler, review lifecycle, or post model.
- Per-account credit pools or billing. Credits stay org-scoped.
- Automatic identical-content broadcast. Fan-out routes through variation by design.
- Per-account analytics dashboards.
- Backfilling `externalId` for providers that never returned one; those rows stay single-account
  until reconnected.

## Acceptance criteria

- WHEN a brand with zero accounts on a platform completes connect THE SYSTEM SHALL create
  exactly one connected credential.
- WHEN a brand with one connected account completes connect and authorizes **the same**
  provider account THE SYSTEM SHALL keep the original credential id, refresh its tokens, and
  create no additional credential.
- WHEN a brand with one connected account completes connect and authorizes a **different**
  provider account THE SYSTEM SHALL create a second connected credential and leave the first
  account's tokens, posts, and warm-up state untouched.
- WHEN a connect is started and abandoned THE SYSTEM SHALL leave the existing connected
  account fully functional and SHALL NOT surface the pending row in the product.
- WHEN two concurrent verifies resolve the same `(brandId, platform, externalId)` THE SYSTEM
  SHALL persist exactly one live credential for that identity.
- WHEN a verify cannot resolve an `externalId` THE SYSTEM SHALL reject the connection rather
  than persist an unidentifiable account.
- WHEN a brand holds N connected accounts on a platform THE SYSTEM SHALL list all N in brand
  Social settings, each with its own handle, avatar, label, posting times, and warm-up state.
- WHEN a schedule or publish targets a specific `credentialId` THE SYSTEM SHALL publish to that
  account only.
- WHEN an automated publish path targets a platform where the brand holds N connected accounts
  THE SYSTEM SHALL create N posts sharing one `groupId`, one per credential.
- WHEN an automated publish path fans out to more than one account on one platform THE SYSTEM
  SHALL request distinct variations rather than reuse one body across accounts.
- WHEN a reply-bot config carries no `credentialId` and the brand holds more than one account
  on that platform THE SYSTEM SHALL fail closed with a configuration error.
- WHEN a credential is soft-deleted THE SYSTEM SHALL permit reconnecting the same provider
  account as a fresh live credential without a unique-index violation.

## Test plan

- `credentials.service.spec.ts` — pending-row creation, no read of connected rows at connect,
  stale-pending reaping, reconcile merge path, reconcile new-account path, unique-violation
  retry, missing-`externalId` rejection, soft-deleted-row reconnect.
- `packages/prisma/prisma/*.test.ts` — partial unique index presence and predicate.
- A shared contract spec asserting **no** integration controller calls a removed
  `upsertForBrand`, and that every OAuth controller routes its callback through
  `reconcileConnectedAccount` — the same shape as the existing
  `oauth-callback-profile-import.contract.spec.ts`, so all 28 platforms are covered by one test.
- `base-integration.controller.spec.ts` — API-key connect creates a pending row and never reads
  a connected one.
- Fan-out coverage in `workflow-trend-publish-executor-registrar`,
  `agent-strategy-autopilot-execution`, and `workflow-content-executor-registrar`: N accounts →
  N posts, one `groupId`, variation requested when N > 1.
- `author-reply-loop` — fail-closed on ambiguous platform resolution.
- `BrandDetailSocialMediaCard.test.tsx` — renders N accounts per platform, exposes Add another
  account, no single-account disclaimer.
- Local formatting, linting, UI-control guard, and staged secret scan only on the MacBook;
  typecheck, tests, and build run in PR CI.
