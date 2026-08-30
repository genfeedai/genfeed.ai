---
name: Native referral credits decisions
description: Architecture and product decisions for issue #1435
type: project
status: active
last_verified: 2026-08-30
topics: [referrals, billing, credits, stripe, growth, attribution]
---

# Native Referral Credits Decisions

## Optimization Target

Ship the complete recurring referral loop with durable attribution, deterministic
credit economics, safe Stripe replay/refund behavior, and an understandable user
and operator audit trail while preserving open-source portability.

## Approaches Considered

1. **Fixed first-purchase bounty.** Smallest implementation and predictable CAC,
   but it does not match the requested recurring incentive and loses motivation
   after the first conversion.
2. **External affiliate provider with Genfeed fulfillment.** Outsources cookies,
   commission math, and refund adjustment, but grants another service access to
   Stripe/customer metadata and still requires Genfeed webhooks, credit-ledger
   fulfillment, UI, tenant mapping, and support tooling.
3. **Native first-touch relationship with recurring percentage rewards.** More
   implementation work, but Genfeed owns customer data, attribution semantics,
   billing-wallet behavior, portability, and the exact audit trail.

## Decision

Use approach 3. Vincent explicitly selected the native, full end-to-end program on
2026-08-30.

## Product Decisions

- Reward the referrer only in the first release.
- Reward 10% of net pre-tax PAYG spend for 12 months after attribution.
- Hold rewards pending for seven days and expire granted credits after 12 months.
- Base rewards on Stripe's net subtotal after discounts, not on list-price credits,
  tax, or a browser-provided value.
- Treat referral credits as non-cash promotional credits with no transfer or
  withdrawal path.
- Keep subscriptions, managed inference, Skills Pro, marketplace purchases, and
  cash affiliates out of this release.

## Ownership Decisions

- A code is owned by a user within a billing account so individual members have
  distinct links while rewards enter the existing shared wallet.
- A referral is owned by the referred billing account, not by an email, device,
  organization slug, or Stripe customer projection.
- Attribution is immutable first-touch. A user cannot replace it from a later link.
- Reward ledger entries use an active organization on the referrer billing account
  for tenant/audit compatibility, but the balance remains billing-account scoped.

## Mechanism Decisions

- Dedicated referral entities own lifecycle state. `SubscriptionAttribution`
  remains content-to-subscription analytics and is not overloaded.
- Postgres rows and unique indexes own correctness. A periodic database-backed
  settlement scan was selected over delayed BullMQ jobs: it has fewer moving
  parts, preserves OSS portability, and recovers from downtime without relying
  on Redis retention. A compare-and-set processing lease prevents duplicate
  workers from granting the same row.
- Credit-ledger idempotency reuses the billing stack's global active-row partial
  unique index, built concurrently so soft-deleted history does not poison a key
  and rollout does not block writes on the hot ledger table.
- Signup preserves `ref` through callback parameters and temporary browser storage;
  the authenticated claim endpoint makes the durable decision.
- Stripe Checkout and payment objects are authoritative for purchase identity and
  net value. Client DTOs cannot submit reward or billing fields.
- Refunds and disputes append compensating ledger transactions; history is never
  edited or deleted to conceal the original grant.
- Settlement and payment reversal share a durable row lease. Only one may
  mutate a reward at a time; expired leases recover from Postgres after crashes.
- Persist both Stripe gross and net purchase cents. Cumulative gross refunds are
  scaled to the pre-tax basis before calculating the compensating credit debit.
- Customer serializers expose reward state and earned-credit values only. Exact
  purchase amounts and purchased-credit quantities are admin-only audit fields.
- Community deployments without organization billing expose no referral routes
  and run no settlement work; configured or relative app URLs keep licensed
  self-hosted referral links portable.

## Abuse Decisions

- Reject same-wallet and shared-active-member referrals deterministically.
- Reject accounts with any prior paid subscription, PAYG ledger purchase, or
  referral attribution. Paid-history checks resolve authoritative linked
  organization ids and do not rely on legacy-nullable billing-account columns.
- Do not block by IP address or email domain: both create false positives for
  agencies, teams, shared offices, and privacy relays.
- Expose aggregate counts and values to referrers, never referred-user email,
  organization label, or personal identity.
