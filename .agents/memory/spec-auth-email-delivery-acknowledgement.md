---
name: Auth email delivery acknowledgement
description: Auth requests report success only after the email provider accepts the message.
type: project
status: active
last_verified: 2026-08-17
topics: [auth, email, notifications, resend]
---

# Auth Email Delivery Acknowledgement Spec

**Why:** A queued notification only proves that Redis accepted an event. Sign-in,
sign-up, verification, and password-reset screens must not report that an email
was sent when the provider has rejected it.
**How to apply:** Auth email uses a bounded, authenticated request to the
notifications service and awaits provider acceptance. Other notification email
keeps the existing asynchronous Redis path.

## Purpose

Make the Better Auth email result match the provider's acceptance result while
preserving one canonical Resend integration in the notifications service.

## Non-Goals

- Waiting for mailbox delivery, opens, clicks, or bounce webhooks.
- Converting non-auth notification email from asynchronous delivery.
- Moving Resend credentials into the API service.
- Exposing provider response details or auth bearer URLs to browser clients or logs.

## Interfaces

- The API calls `POST /v1/internal/email-deliveries` on the notifications service.
- The request uses the shared `GENFEEDAI_API_KEY` bearer credential.
- The request carries the email payload and an auth-issuance idempotency key.
- A successful response contains the provider email id.

## Acceptance Criteria

- WHEN Better Auth requests a magic-link, verification, or password-reset email,
  THE SYSTEM SHALL wait for provider acceptance before returning success.
- IF the notifications service is unavailable, times out, is not configured, or
  the provider rejects the message, THE SYSTEM SHALL return an error and SHALL
  NOT log the auth email as accepted.
- WHEN the provider accepts the message, THE SYSTEM SHALL return a non-empty
  provider email id and log an acceptance event without the recipient address,
  auth URL, or plaintext token.
- THE SYSTEM SHALL authenticate the internal delivery endpoint with
  `GENFEEDAI_API_KEY` and fail closed outside development when the key is absent.
- THE SYSTEM SHALL bound the API-to-notifications request to ten seconds.
- THE SYSTEM SHALL preserve the Redis-backed `sendEmail` contract for non-auth
  notification workflows.

## Test Plan

- API service tests for accepted, rejected, malformed, timed-out, and
  misconfigured synchronous delivery requests.
- Better Auth mailer tests proving all three auth email types use synchronous
  delivery, propagate failure, and only log after acceptance.
- Notifications controller tests for provider acceptance, disabled Resend,
  retryable provider failure, and permanent provider rejection.
- Existing asynchronous notification and Resend service tests remain green.
