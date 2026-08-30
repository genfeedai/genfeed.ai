---
name: Native referral credits
description: End-to-end first-touch referral attribution and recurring PAYG credit rewards
type: project
status: active
last_verified: 2026-08-30
topics: [referrals, billing, credits, stripe, growth, attribution]
---

# Native Referral Credits Spec

GitHub issue: #1435

## Purpose

Let an authenticated Genfeed customer share a durable referral link and earn
Genfeed credits when a newly referred billing account purchases PAYG credits.
The program is native to Genfeed so the open-source deployment remains portable,
the credit ledger remains authoritative, and no external affiliate service needs
access to customer or Stripe data.

## Non-Goals

- Cash, bank, PayPal, or cryptocurrency affiliate payouts.
- Multi-level, reseller, marketplace, or employee referral programs.
- Rewards for subscription invoices, managed-inference checkout, Skills Pro, or
  marketplace purchases in the first release.
- A reward for the referred customer; the first release is referrer-only.
- Attribution based on IP address, device fingerprint, email domain, or hidden
  probabilistic identity matching.
- A public leaderboard or disclosure of referred-customer identity.

## Program Contract

- Each user may have one opaque referral code per billing account.
- Referral links use `https://app.genfeed.ai/sign-up?ref=<code>`.
- Attribution is first-touch and immutable for a referred billing account.
- A referral may be claimed only by a newly provisioned billing account before
  its first paid subscription or PAYG purchase.
- The referrer earns 10% of the referred account's net pre-tax PAYG amount as
  Genfeed credits for 12 months from attribution.
- Rewards remain pending for seven days, then enter the referrer's shared billing
  wallet and expire 12 months after grant.
- Referral credits have no cash value and cannot be transferred or withdrawn.

## Interfaces

### Persistence

- `ReferralCode` binds an opaque code to the owning user, reward billing account,
  and an organization used for the credit-ledger audit row.
- `Referral` binds one referred billing account to one referral code and snapshots
  the referrer/referred billing and organization ids, attribution time, and reward
  eligibility end.
- `ReferralReward` records one candidate reward per Stripe Checkout session,
  including payment intent, net amount, purchased credits, reward credits,
  lifecycle state, settlement time, and ledger/reversal references.
- All records use soft-delete fields and database uniqueness for first-touch and
  payment idempotency.

### Authenticated API

- `GET /referrals/me` returns the current user's referral link and aggregate
  pending/earned/conversion statistics for the active billing account.
- `GET /referrals/me/rewards` returns the current user's bounded reward history.
- `POST /referrals/me/claim` accepts one validated referral code and atomically
  attributes the active billing account when eligibility checks pass.
- Platform administrators may list referral relationships and rewards through a
  serializer-backed admin endpoint without exposing raw invitee email addresses.

### Signup handoff

- The public sign-up, magic-link, Google OAuth, and post-signup callback paths
  preserve a validated `ref` parameter.
- The browser stores the code only until an authenticated claim succeeds or the
  server returns a terminal ineligible/already-attributed result.
- The server never trusts browser identity, billing ids, reward percentages, or
  purchase amounts.

### Stripe and settlement

- A successful organization PAYG Checkout creates one pending referral reward
  only after the purchased-credit grant is durably recorded.
- Net pre-tax paid amount from Stripe is authoritative. Coupons reduce the reward;
  tax and zero-value checkouts do not increase it.
- Durable database rows are the source of truth. Scheduler scans claim due rows
  with a database lease and may replay safely.
- Refund and dispute events reduce, cancel, or reverse the associated reward.
- Granted reward reversals may create a negative available wallet balance only
  up to the amount previously granted by that reward; they never delete ledger
  history.

## Security and Abuse Rules

- A billing account cannot refer itself.
- A referral is rejected when any active user belongs to both the referrer and
  referred billing accounts.
- A billing account with an existing paid subscription, PAYG purchase, or prior
  referral cannot claim another code.
- Referral codes are opaque random values, normalized and length-limited by DTOs,
  and never accepted as dynamic query keys.
- Claim and referral read endpoints are authenticated, rate-limited, and scoped
  through the request-context organization and resolved billing account.
- Reward amounts, statuses, Stripe ids, and billing ids are never client writable.
- Logs use internal record ids and bounded reason codes, not email addresses or
  full referral links.

## Edge Cases and Failure Modes

- Replayed Checkout, claim, or scheduler work returns the existing row and
  never grants twice.
- A deleted/detached reward organization is replaced by another active organization
  on the same referrer billing account; no active organization leaves the reward
  failed and recoverable by a later scan.
- A referral code owner leaving the billing account does not redirect the reward;
  the code remains bound to the original wallet unless administratively disabled.
- An invalid, missing, deleted, or self-referral code leaves signup usable and
  returns a safe claim result.
- Partial refunds proportionally reduce a pending reward or reverse only the
  over-granted difference.
- Full refunds and disputes cancel pending rewards or reverse granted rewards.
- Scheduler outages do not lose rewards because pending rows remain
  queryable by eligibility time and state.

## Acceptance Criteria

- WHEN an authenticated billing-account member opens the Referral Hub THE SYSTEM
  SHALL return one stable opaque share link for that user and billing account.
- WHEN a new visitor follows a referral link through magic-link or Google signup
  THE SYSTEM SHALL preserve and claim the same referral code after provisioning.
- WHEN an eligible new billing account claims a valid code THE SYSTEM SHALL store
  one immutable first-touch referral without exposing customer identity.
- IF the referrer and referred account are the same or share an active member THE
  SYSTEM SHALL reject attribution and SHALL grant no reward.
- IF the referred account has prior paid activity or attribution THE SYSTEM SHALL
  reject a new claim and SHALL keep any existing attribution unchanged.
- WHEN a referred billing account completes a paid PAYG Checkout during the
  12-month eligibility window THE SYSTEM SHALL create exactly one pending reward
  equal to 10% of net pre-tax paid value in credits.
- WHEN a pending reward reaches seven days without a disqualifying refund or
  dispute THE SYSTEM SHALL add it once to the referrer's shared billing wallet,
  record the Stripe/referral references in the credit ledger, and expose it as
  earned in the Referral Hub.
- WHEN a qualifying payment is partially or fully refunded or disputed THE SYSTEM
  SHALL reduce, cancel, or reverse its reward idempotently while retaining the
  audit trail.
- WHEN the API process restarts THE SYSTEM SHALL recover every due
  pending or failed-retry reward from durable database state.
- THE SYSTEM SHALL provide platform-admin referral and reward audit visibility.
- THE SYSTEM SHALL document program eligibility, reward timing, expiration,
  non-cash status, abuse rules, and support handling.

## Test Plan

- Prisma migration structural tests cover relations, soft-delete fields, first-touch
  uniqueness, payment idempotency, and due-reward indexes.
- Service tests cover code reuse, claim eligibility, shared-member self-referral,
  paid-account rejection, first-touch concurrency, stats privacy, and tenant scope.
- Stripe handler tests cover pending creation, discounts/tax, eligibility expiry,
  duplicate delivery, partial/full refunds, disputes, and unrelated payments.
- Settlement tests cover due claims, concurrent workers, ledger idempotency,
  organization fallback, retry recovery, expiration, and reversals.
- Auth/UI tests cover query preservation through magic-link and Google OAuth,
  post-signup claim cleanup, copy/share states, pending/earned history, empty and
  error states, responsive layout, keyboard access, and semantic tokens.
- Admin and serializer tests cover bounded fields and platform-role authorization.
- Required package tests, affected typechecks, builds, integration tests, and E2E
  run on the Mac Studio or PR CI; the MacBook runs changed-file format/lint only.
