# System event webhooks

Optional deployment-wide system events use a durable database outbox. Configure
`SYSTEM_EVENTS_WEBHOOK_URL` (HTTPS), `SYSTEM_EVENTS_WEBHOOK_SECRET` (at least 32
characters) and `SYSTEM_EVENTS_ENABLED_AT` (ISO timestamp) on the API and workers.
Unset configuration disables recording/delivery. The observation start prevents
historical signup floods; worker recovery catches account-created hook failures.

The receiver accepts JSON `{ "payload": "<serialized event>" }`, authenticates
`X-Genfeed-Signature` as hex HMAC-SHA256 over
`X-Genfeed-Timestamp + "." + payload`, and checks that the delivery timestamp is
within five minutes. The event has version 1, id, type, occurredAt, and data.
Deduplicate by id. Persist before acknowledging with 2xx. Reject redirects.

Events: user.created; subscription.created/updated/canceled;
subscription.payment_succeeded; payment.failed; credits.purchased. Billing emits
only live events after signature validation. Subscription checkout is deliberately
not a second payment notification. A zero amount is a free redemption, not revenue.

The existing once-per-minute notification-delivery recovery schedule dispatches due rows with a
lease, retrying failures with backoff capped at one hour. Receiver outages never
make signup or billing wait for external HTTP. Outbox persistence failures cause
Stripe retries; signup failures recover from the users table. This is at-least-once
delivery: receivers must suppress replay by id. Rotating the destination can replay
pending events to the new destination. Delivery history retains status codes, never
response bodies or secrets. The deployment operator controls these settings; they
must never be writable by ordinary tenant users.

Verified Stripe activity is persisted before billing side effects and duplicate
suppression. Alerts describe provider activity, not a guarantee that local
fulfillment succeeded. Persistence failure returns an error before fulfillment
so Stripe can retry without repeating completed billing side effects.
