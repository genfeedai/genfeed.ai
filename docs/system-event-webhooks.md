# System notifications

System notifications are owned by this deployment's API, workers and existing
notifications service. They work without any external management application.

## Configuration

Set `SYSTEM_EVENTS_ENABLED_AT` (ISO timestamp) on API and workers to begin
recording. Unset means disabled: ordinary signup and billing continue, with no
notification delivery calls. The timestamp prevents historical signup floods.

Set `SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL` on the notifications service to
an incoming webhook owned by your deployment. API/workers use the existing
`GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL` and `GENFEEDAI_API_KEY` configuration,
just as acknowledged email delivery does. No additional receiver endpoint,
external account, bot token or event signing secret is required.

Apply the additive outbox/settings migration before enabling recording.
Notification settings, history and retry scheduling are available through
`/v1/admin/system-notifications`, using existing super-admin and IP allowlist
requirements. Any authorized administration client can consume this JSON:API
resource. Webhook URLs and event payloads are never returned by this resource.

## Delivery

Better Auth user-created events and verified live Stripe callbacks record
minimal versioned payloads with stable event IDs in the database outbox. Billing
activity is persisted before fulfillment and duplicate suppression. Alerts
report provider activity, not a guarantee of local fulfillment.

The existing once-per-minute worker notification recovery schedule calls
`NotificationsService`, which requests acknowledged delivery through the
notifications service's authenticated internal endpoint. Its existing
`DiscordService` validates and sends to the configured incoming webhook.
The API owns delivery leases, deduplication, event filtering, history and
retries with backoff capped at one hour. Manual retry schedules the next sweep.
Disabled or unselected event types are skipped and are not replayed later.

Events: user.created; subscription.created/updated/canceled;
subscription.payment_succeeded; payment.failed; credits.purchased. Subscription
checkout is excluded as a second payment notification. Paid and zero-total
`no_payment_required` credit checkouts are supported; free redemptions are
labelled separately from payments. Stripe's endpoint must already enable these
source events, including invoice.payment_failed for failure alerts.

External delivery never runs inside signup or billing requests. Signup hook
persistence failures recover from canonical users created after the configured
start. Billing persistence failures return an error before side effects so
Stripe retries. Missing or unavailable notification services leave events pending.

Delivery is at-least-once: a crash after Discord acceptance but before the API
records success can duplicate a message. Provider failures expose no response
body or secret URL. Discord mentions and redirects are disabled.
