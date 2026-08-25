---
name: Multi-account per platform decisions
description: Architecture and tradeoffs for multiple accounts of one platform under one brand
type: project
---

# Multi-Account Per Platform Decisions

## Chosen approach

Move credential identity from `(brandId, platform)` to `(brandId, platform, externalId)`, and
split the connect flow into **provision pending → exchange tokens → reconcile identity**.

The reason this needs three steps rather than a smarter upsert: `externalId` is not knowable at
connect time. The user picks which account to authorize inside the provider's own consent
screen, after we have already redirected them. Any upsert that runs at connect time is guessing.
Today it guesses "the one existing row", which is why a second connect destroys the first
account — and why it destroys it *before* the user has even chosen, so an abandoned consent
screen also breaks the working account.

So connect stops guessing. It writes a throwaway pending row that holds only the OAuth nonce.
The callback exchanges tokens onto that row, resolves the provider's account id through the
existing `updateExternalProfile`, and only then asks the question that could not be asked
earlier: *is this account already connected to this brand?* Same identity → merge into the
incumbent and drop the pending row. New identity → the pending row graduates into a second
account.

## Why the chokepoint makes this cheap

All 28 OAuth integrations and every API-key integration reach persistence through exactly two
functions — `CredentialsService.upsertForBrand` and `beginOAuthForBrand` — plus
`BaseIntegrationController.getOrCreateCredential` for the token-paste platforms. Three
integrations (Ghost, Dev.to, Beehiiv) call `upsertForBrand` directly.

That means "support every platform" is a change at one seam, not 28 changes. The per-platform
work is a contract test proving no controller regressed, not per-platform implementation.

The callbacks needed no identity work at all: `findPendingOAuthCredential` already resolves the
OAuth nonce to a specific credential id, and every verify already patches by that id. The
clobber was never in the callback — only in connect.

## Persistence decision

One migration, one index:

```sql
CREATE UNIQUE INDEX "credentials_brand_platform_external_idx"
  ON "credentials" ("brandId", "platform", "externalId")
  WHERE "isDeleted" = false AND "externalId" IS NOT NULL;
```

Partial, because pending rows carry a null `externalId` and several may legitimately coexist
during concurrent connect attempts, and because soft-deleted rows must not block reconnecting
the same account later. This matches the partial-index pattern already used by
`SocialWarmupEnrollment`.

No new column. `externalId`, `label`, `externalHandle`, `externalName`, and `externalAvatar`
already exist and are already serialized — the data model was multi-account-ready; only the
write path was not.

## Race decision

Two verifies resolving the same identity concurrently is a real scenario (double-clicked
consent, duplicated provider callback). Reconcile runs in a transaction and treats a unique
violation as "the other request won", retrying once as a merge. The index is the arbiter rather
than an advisory lock, because the index also protects against writers that bypass the service.

## Fan-out decision

Automated publish paths fan out to every connected account on a platform, one `Post` per
credential under a shared `groupId` — the grouping field already used for multi-destination
posts.

Fan-out routes through the existing variation path when more than one account on the same
platform is targeted, rather than copying one body N times. This is a correctness decision, not
a taste one: TikTok, Instagram, and YouTube deduplicate by media hash and suppress the second
and later uploads, X limits duplicate text, and lockstep sibling accounts are the behavioral
signature platforms cluster and action together. An identical-broadcast implementation would
ship a feature that quietly reduces reach and raises ban risk for the accounts it touches. The
variation service (`post-variation.service.ts`) already exists and already produces distinct
angles per output.

## Ambiguous-resolution decision

Seven call sites resolved "the account for this brand+platform" and took the first row. With one
account per platform that was merely implicit; with N it is a silent wrong-account defect. They
split cleanly:

- **Fan out** — `workflow-trend-publish-executor-registrar`,
  `agent-strategy-autopilot-execution`, `workflow-content-executor-registrar` (when no explicit
  `credentialId` is supplied). Publishing to every account is the intended behavior.
- **Fail closed** — `author-reply-loop`, `twitter.service.findTwitterCredential`. Acting *as* an
  identity with the wrong account is worse than not acting; these demand an explicit
  `credentialId` and error when the brand holds more than one candidate.
- **Already correct, left alone** — `x-activity-webhook` resolves by `externalId`, which is the
  right key and gets sharper with multi-account. `assertCredentialAccess` in `social-sources`,
  `outreach-campaigns`, `x-ad-watched-advertisers`, and `ads-research` are id-keyed
  authorization guards, not resolvers. `publish-approvals` resolves `post.credentialId` and uses
  platform only as a guard. `analytics-aggregation` filters `PostAnalytics.platform` for a
  platform-level rollup, which stays platform-level.

## Alternatives considered

1. **Unique index on `(brandId, platform)` plus a "primary account" flag.** Keeps the current
   write path and adds a concept. Rejected: it does not solve the actual bug (identity is still
   guessed at connect time), and "primary" would leak into every publish surface.

2. **Key the upsert on `externalId` supplied by the client at connect time.** Rejected: the
   client does not know it either. Only the provider does, only after consent.

3. **Keep one row per platform and store additional accounts in a JSON column.** Rejected on
   contact with the rest of the system — posts, warm-up enrollments, posting cadences, slot
   reservations, personas, social sources, and outreach campaigns all hold a `credentialId`
   foreign key. Accounts must be rows.

4. **Separate brand per account** — today's workaround. Rejected as the product answer: it
   duplicates brand voice, harness, memory, and analytics for what is one brand, and it makes
   cross-account scheduling impossible.

## Migration and compatibility decision

Green-field, per repo philosophy: `upsertForBrand` is deleted rather than deprecated, and the
single-account disclaimer is removed rather than feature-flagged. Existing credentials already
satisfy the new index — one row per `(brandId, platform)` is trivially unique under
`(brandId, platform, externalId)`.

Rows whose `externalId` was never populated by their provider are excluded from the index by its
predicate and keep working as single accounts; they gain an identity the next time they are
reconnected. No backfill job.
