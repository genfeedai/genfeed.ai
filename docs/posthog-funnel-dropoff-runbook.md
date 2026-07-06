# PostHog Funnel Drop-off Runbook

This runbook covers the cloud signup funnel from account creation through checkout and activation.

## Canonical Events

- `signup_started`: user picked Google or magic-link signup.
- `signup_completed`: authenticated user reached `/onboarding/post-signup`.
- `checkout_started`: post-signup handoff created a Stripe checkout URL.
- `checkout_completed`: Stripe returned the user to onboarding with a checkout completion marker.
- `first_credit_purchase`: checkout completion for an onboarding credit purchase.
- `onboarding_completed`: user completed the onboarding success step.
- `first_successful_publish`: user successfully published from a tracked activation surface.

All events are emitted only by the gated Genfeed Cloud PostHog client. Self-hosted and desktop builds keep analytics disabled.

## Alerts

Configured by:

```bash
bun run posthog:funnel-alerts -- --apply
```

Required environment:

- `POSTHOG_PERSONAL_API_KEY`: personal API key with `insight:read`, `insight:write`, `subscription:read`, and `subscription:write`.
- `POSTHOG_ENVIRONMENT_ID`: PostHog environment id.
- `POSTHOG_ALERT_TARGET_TYPE`: `slack` or `email`.
- `POSTHOG_ALERT_TARGET_VALUE`: Slack channel or email target watched by the team.

Optional environment:

- `POSTHOG_HOST`: PostHog app host. Defaults to `https://us.posthog.com`.
- `POSTHOG_INGESTION_HOST`: PostHog ingestion host. Defaults from `POSTHOG_HOST`.
- `POSTHOG_PROJECT_ID`: project id for query checks when it differs from `POSTHOG_ENVIRONMENT_ID`.
- `POSTHOG_PROJECT_API_KEY`: project API key for synthetic `--simulate-break` capture.
- `POSTHOG_FUNNEL_WINDOW_MINUTES`: alert query window. Defaults to `60`.
- `POSTHOG_FUNNEL_MIN_SIGNUPS`: minimum signups before signup-to-checkout fires. Defaults to `1`.
- `POSTHOG_FUNNEL_MIN_CHECKOUTS`: minimum checkout starts before checkout-to-completion fires. Defaults to `1`.
- `POSTHOG_FUNNEL_MIN_CONVERSION`: minimum acceptable step conversion rate. Defaults to `0.01`.

## Signup to Checkout Drop-off

Fires when `signup_completed` appears in the window but `checkout_started` is missing or below the configured conversion floor.

Check:

1. `/onboarding/post-signup` is reachable in cloud.
2. `gf_selected_plan` or `?credits=` handoff state is present after signup.
3. `POST /services/stripe/checkout` returns a URL.
4. Stripe price env vars are present for the selected plan or PAYG pack.
5. Browser console and API logs for `Failed to create checkout session from post-signup`.

## Checkout to Completion Drop-off

Fires when `checkout_started` appears in the window but `checkout_completed` is missing or below the configured conversion floor.

Check:

1. Stripe checkout session success URL includes `checkout=completed&checkoutKind=...`.
2. Stripe redirects back to an onboarding route after payment.
3. Stripe webhook `checkout.session.completed` is healthy.
4. User subscription or credit grant was reconciled.
5. Browser console for blocked return navigation or auth/session refresh failures.

## Simulate #1421 Failure Mode

Run this against the production PostHog environment only when you are ready for a real alert delivery:

```bash
POSTHOG_PERSONAL_API_KEY=phx_... \
POSTHOG_ENVIRONMENT_ID=12345 \
POSTHOG_PROJECT_ID=12345 \
POSTHOG_PROJECT_API_KEY=phc_... \
bun run posthog:funnel-alerts -- --simulate-break --check
```

The simulator sends synthetic `signup_completed` events without `checkout_started`, then runs the same HogQL alert checks. Use `--test-delivery` after `--apply` to force PostHog to send test subscription deliveries.
