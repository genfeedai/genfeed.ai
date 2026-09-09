# Lifecycle email workflows and performance

Tracked implementation: GitHub issue #4600.

## Decision

Extend the existing hidden workflow engine and durable notification outbox. Independent Redis mail paths cannot prove delivery or recover reliably. An external campaign platform would split eligibility and attribution from canonical product state. The existing engine keeps eligibility, retries, provenance and admin reporting in one system.

## Product contract

- Lifecycle graphs are system-owned and invisible in customer workflow libraries; email preferences are visible. Internal notification work consumes no customer credits and never notifies about its own completion.
- Authentication mail retains request-time provider acknowledgement.
- Email delivery uses a stable per-event/per-recipient identity. Provider acceptance and mailbox delivery are different states; bounce, complaint, opens and clicks never overwrite that distinction.
- Optional daily recaps cover the previous UTC calendar day, only with completed outputs. Weekly recaps cover the previous Monday–Sunday UTC week and require at least five distinct completed user-facing outputs. The initial calendar is explicitly UTC, not an inferred user timezone.
- Generated content is counted from canonical completion timestamps. Uploads, failed attempts and intermediate children are excluded. Historical timestamps are not invented or backfilled from mutable updatedAt.
- Onboarding eligibility is checked at delivery: do not ask already-connected users to connect, or already-activated users to publish for the first time. Recaps include a relevant next step.
- Long-generation email is preference-controlled, minimum two minutes, and links to the asset. Generation success is never coupled to the email provider.
- Billing alerts use spendable credits (settled minus holds), with deduplication/cooldown and cancellation when balance recovers. Receipts follow recorded credit purchases.
- Unsubscribe and explicit topic preferences are checked at send time. Authentication and receipts are operational messages.

## Attribution

Record first-party tracked CTA visits using opaque stored tokens and approved stored destinations. Never accept an arbitrary redirect URL from the caller. An email click is engagement, not a conversion. A conversion must match confirmed server-side product state, the same organization and user, a configured goal and an eligible preceding click within seven days. Attribute the event to the latest qualifying click. Deduplicate by goal plus canonical domain event identity. Do not count opens as conversions or present attributed outcomes as causal lift. Credit amounts are not currency revenue.

Admin reports use a created-message date cohort and expose explicit metric denominators. Provider acceptance, delivered, bounced, complained, opened, clicked and converted messages remain distinct. Opens are approximate; forwarded links and automated scanners can affect click reporting. No provider console credentials are exposed to customers.

## Acceptance and verification

Focused coverage must exercise duplicate dispatch/provider callbacks, stale eligibility, worker retry/recovery, subscriber opt-out, four versus five outputs, UTC week boundaries, same-user/tenant attribution, future/out-of-window actions and confirmed credit grants. Required PR checks and independent review remain delivery gates. Production webhook configuration is documented; development verification never sends real customer email.

## Activation

Deploy the schema migrations before the API and workers. Configure the existing email provider credentials, `GENFEEDAI_APP_URL`, `GENFEEDAI_API_URL`, and `RESEND_WEBHOOK_SECRET` in the deployment environment. Register the public API endpoint `/v1/email-performance/webhooks/resend` for `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, and `email.complained`. The endpoint requires the original request bytes and validates the signed webhook headers. Reverse proxies must preserve those headers and body.

The platform scheduler discovers email work every five minutes. UTC daily/weekly windows and send-time preferences control eligibility. Generation timestamps begin with new transitions after migration; historical completion dates are not backfilled. Generation emails are opt-in and require a recorded duration of at least two minutes. This version does not infer whether a creator has already viewed the result.

The administrator email page reports message cohorts and attributed product actions. Provider receipt setup is required for delivery/bounce/open metrics; accepted messages are recorded directly from the provider response. Attribution uses first-party CTA clicks even if provider click reporting is disabled. Validate configuration using an operator-owned test recipient before enabling customer delivery. Do not use production recipients in automated verification.
