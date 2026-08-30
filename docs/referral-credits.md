# Native Referral Credits

Genfeed's referral system is part of the open-source billing stack. It does not
depend on a hosted affiliate vendor and keeps attribution, reward settlement,
and the credit ledger portable across supported deployments.

## Customer contract

- A billing-account member can create one opaque referral code for each billing
  account they belong to.
- A new billing account can claim one code before it has paid activity. The
  first valid claim is immutable.
- The referrer earns credits equal to 10% of the referred account's net,
  pre-tax pay-as-you-go credit purchases for 12 months.
- Rewards remain pending for seven days and expire 12 months after settlement.
- Subscription charges, managed inference, marketplace purchases, and cash
  payouts are outside this program.
- Refunds reduce pending rewards. Refunds and disputes after settlement create
  compensating credit-ledger debits; a used reward may therefore create a
  bounded negative balance.

The customer Referral Hub is on the organization Credits settings page. It
shows aggregate counts and credit totals, never referred-customer identity.
Platform administrators can audit reward records under **Administration →
Referral Rewards**.

## Attribution and abuse controls

The signup link uses `?ref=<opaque-code>`. The validated value is carried
through Google or magic-link authentication and claimed only after the user's
billing account and organization exist. Invalid or ineligible codes do not
block signup.

A claim is rejected when the accounts are identical, share an active member,
already have an attribution, or the referred account already has paid ledger
or subscription activity. All customer reads require authenticated billing
membership and all claim/read routes are rate limited.

## Settlement operations

`ReferralReward` is the durable source of truth. Checkout-session uniqueness,
credit-ledger idempotency keys, a processing lease, and retry backoff make both
Stripe retries and scheduled settlement safe. The API scheduler scans due rows
every five minutes, recovers expired leases, grants expiring credits, and links
the resulting ledger transaction to the reward.

Operators should investigate `FAILED` rewards in the admin audit view. The
failure reason is bounded and contains no referral link or customer email.

## Deployment boundary

Referral code and attribution code ships in every image. Rewards are created
only by the organization PAYG Stripe webhook, so Community deployments using
managed cloud-credit checkout do not create local referral rewards. Licensed
self-hosted deployments with organization billing use the same native path.
