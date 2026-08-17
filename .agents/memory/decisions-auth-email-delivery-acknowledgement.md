---
name: Auth email delivery acknowledgement decisions
description: Keep Resend in notifications and add a guarded synchronous auth-email boundary.
type: project
status: active
last_verified: 2026-08-17
topics: [auth, email, notifications, resend]
---

# Auth Email Delivery Acknowledgement Decisions

**Why:** Authentication needs an immediate provider result, but email provider
ownership and credentials should remain centralized in the notifications service.
**How to apply:** Use synchronous internal HTTP for auth email only and keep Redis
pub/sub for notification traffic that does not need request-time acknowledgement.

## Chosen Approach

Add a guarded notifications endpoint that calls the existing `ResendService` and
returns the provider email id. The API calls it with `safeFetch`, a ten-second
timeout, the configured notifications origin allowlist, and the shared internal
bearer key. Better Auth awaits that response before reporting success.

## Alternatives Considered

1. **Redis request/reply acknowledgement.** Preserves the transport but adds
   correlation queues, response subscriptions, timeout cleanup, and restart races
   for a single request-response use case.
2. **Direct Resend calls from the API.** Provides immediate feedback but duplicates
   provider configuration, credential injection, sender policy, error mapping, and
   logging across services.
3. **Selected: guarded internal HTTP.** Reuses the existing provider adapter and
   service authentication pattern with a bounded request whose semantics match
   authentication's need for an immediate result.

## Failure Semantics

- Retryable provider failures and disabled delivery return service-unavailable.
- Permanent provider rejection returns bad-gateway.
- The API converts all downstream failures to one safe auth-email delivery error.
- Provider diagnostics stay in notifications logs and are not returned to clients.

## Idempotency and Privacy

Each auth issuance supplies an idempotency key derived from the existing one-way
token correlation id. The plaintext token, action URL, recipient address, email
HTML, and internal bearer key are never logged by the new boundary.
