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
- Rewards remain pending for seven days. Settlement issues the credits, which
  expire 12 months after issuance.
- Subscription charges, managed inference, marketplace purchases, and cash
  payouts are outside this program.
- Refunds reduce pending rewards. Refunds and disputes after settlement create
  compensating credit-ledger debits; a used reward may therefore create a
  bounded negative balance.

The customer Referral Hub is on the organization Credits settings page. It
shows aggregate counts, credit totals, and the referrer's own reward values;
it never returns referred-customer identity, purchase amounts, or purchased
credit quantities. Platform administrators can audit full reward records under
**Administration → Referral Rewards**.

## Attribution and abuse controls

The signup link uses `?ref=<opaque-code>`. The validated value is carried
through Google or magic-link authentication and claimed only after the user's
billing account and organization exist. Invalid or ineligible codes do not
block signup.

A claim is rejected when the accounts are identical, share an active member,
already have an attribution, or the referred account already has paid ledger
or subscription activity. Paid-history checks cover every authoritative
organization link on the billing account, including subscriptions whose legacy
billing-account column is null. All customer reads require authenticated
billing membership and all claim/read routes are rate limited.

## Settlement operations

`ReferralReward` is the durable source of truth. Checkout-session uniqueness,
active-row database-unique credit-ledger idempotency keys, a shared settlement/reversal
lease, and retry backoff make Stripe retries, cumulative refunds, disputes, and
scheduled settlement safe. The API scheduler scans due rows every five minutes,
recovers expired leases, grants expiring credits, and links the resulting ledger
transaction to the reward. Tax-inclusive Stripe refunds are normalized back to
the stored pre-tax purchase basis before reward credits are adjusted.

The feature reuses the billing stack's stricter global active-ledger idempotency
index, which is installed concurrently so normal credit writes remain available
while the hot table is indexed. Soft-deleted ledger history does not reserve
active idempotency keys.

Operators should investigate `FAILED` rewards in the admin audit view. The
failure reason is bounded and contains no referral link or customer email.

## Deployment boundary

Referral code and attribution code ships in every image. Community deployments
without organization billing register no referral HTTP routes, skip the
settlement scheduler, and ignore organization-PAYG reward events. Licensed
self-hosted deployments with organization billing use the same native path.
Share links use the configured `GENFEEDAI_APP_URL`; when it is absent the API
returns a portable relative signup URL that the customer app resolves against
its own origin.
