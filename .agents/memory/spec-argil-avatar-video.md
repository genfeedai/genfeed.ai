---
name: Argil avatar video model
description: Add Argil Atom as an additive avatar-video model with BYOK, Studio Clips dispatch, and asynchronous completion.
type: project
status: active
last_verified: 2026-08-12
topics: [argil, avatar-video, byok, clips, webhooks, models]
---

# Argil Avatar Video Model Spec

GitHub issue: #2849

**Why:** Argil provides a complementary avatar-video model that should be selectable without replacing HeyGen or entering the generic cinematic video pipeline.
**How to apply:** Route Argil Atom through the existing avatar-video provider boundary, keep HeyGen as the default, and complete the production path from BYOK configuration through Studio Clips generation and Genfeed-owned media ingestion.

## Purpose

Add Argil Atom as a first-class, additive avatar-video model. An organization with an Argil API key can select Argil in Studio Clips, submit Argil avatar and voice IDs, generate one Argil render per selected highlight, receive asynchronous completion, and persist the resulting video through the existing clip-result and media lifecycle.

## Optimization Target

Optimize for the smallest production-testable vertical slice that preserves provider boundaries and can coexist with HeyGen. Prefer explicit provider dispatch, strict external-response parsing, and idempotent completion over a broad Argil platform abstraction.

## Non-Goals

- Replacing HeyGen or changing the default avatar-video provider.
- Routing Argil through generic cinematic text-to-video or image-to-video adapters.
- Exposing Argil's editor, B-roll, music, product-interaction, or story features.
- Creating or training Argil avatars from Genfeed.
- Migrating existing HeyGen identity defaults.
- Making Argil a Genfeed-managed provider; this slice uses organization BYOK or a self-hosted environment key.

## Interfaces

- Model key: `argil/atom` with avatar-video capabilities limited to `16:9` and `9:16`.
- BYOK provider: `argil`; validation calls `GET https://api.argil.ai/v1/avatars` with `x-api-key`.
- Environment fallback: `ARGIL_KEY`; cloud customers may instead store an organization-scoped BYOK key.
- Avatar provider name: `argil`; HeyGen remains the default supported provider.
- Generation:
  - `POST https://api.argil.ai/v1/videos` creates a video project containing one moment.
  - `POST https://api.argil.ai/v1/videos/{id}/render` starts rendering.
  - The moment contains the selected Argil `avatarId`, `voiceId`, and highlight transcript.
  - The project uses `model: ARGIL_ATOM`, `aspectRatio: 9:16`, and correlation metadata.
- Completion:
  - `POST /v1/webhooks/argil/callback` handles `VIDEO_GENERATION_SUCCESS` and `VIDEO_GENERATION_FAILED`.
  - A per-video HMAC token authenticates the callback because Argil's public documentation does not define a provider signature header.
  - `GET https://api.argil.ai/v1/videos/{id}` remains the status-read boundary.
- UI: Studio Clips adds an enabled Argil provider option and uses provider-neutral avatar/voice labels.
- Agent/MCP clip tools accept `avatarProvider: argil` anywhere the supported-provider contract is exposed.

## Key Decisions

- Argil is implemented as a dedicated `AvatarVideoProvider`, not a generic video-generation adapter.
- `argil/atom` is the only initial Argil model key; legacy `ARGIL_V1` is excluded.
- Existing Clip Studio manual avatar/voice ID inputs are reused for the first production slice.
- Completion reuses the existing clip-result reconciliation and Genfeed media-ingestion services.
- Provider callbacks are idempotent: terminal clip results are not processed twice.
- The webhook token is an HMAC of the Argil video ID using `ARGIL_WEBHOOK_SECRET`; the secret itself is never placed in the callback URL.
- If the webhook base URL or secret is absent, generation still starts and status remains queryable, but production configuration is expected to provide both so clip projects reach terminal state automatically.

## Edge Cases and Failure Modes

- Missing API key fails before an Argil request is sent.
- Missing avatar ID, voice ID, or transcript fails before project creation.
- A create response without a video ID is treated as a provider failure and is not rendered.
- A render failure preserves the created Argil ID in logs but marks the local dispatch failed.
- `DONE` without a usable video URL is not treated as successful completion.
- Unknown Argil statuses remain processing rather than being guessed terminal.
- Invalid webhook tokens, malformed payloads, mismatched external IDs, and unknown callback targets are rejected or ignored without mutating media.
- Replayed success or failure callbacks are idempotent.
- Provider failures are isolated per highlight so one failed Argil render does not discard sibling clip jobs.

## Acceptance Criteria

- WHEN `argil/atom` is inspected THE SYSTEM SHALL report avatar-video capabilities for `16:9` and `9:16` without advertising `1:1`.
- WHEN an organization saves an Argil BYOK key THE SYSTEM SHALL validate it against Argil before enabling it.
- WHEN Studio Clips selects Argil THE SYSTEM SHALL submit `avatarProvider: argil` with the entered avatar and voice IDs.
- WHEN an Argil clip is dispatched THE SYSTEM SHALL create and render exactly one `ARGIL_ATOM` video project for that highlight.
- WHEN Argil accepts a render THE SYSTEM SHALL persist the Argil video ID as the clip result's provider job ID and `argil` as its provider name.
- WHEN Argil sends an authenticated success callback THE SYSTEM SHALL ingest the returned video and reconcile the owning clip project.
- WHEN Argil sends an authenticated failure callback THE SYSTEM SHALL mark only the correlated clip result failed and reconcile the owning project.
- IF a callback is forged, malformed, mismatched, or replayed THE SYSTEM SHALL NOT duplicate or corrupt clip output state.
- WHEN no Argil provider is selected THE SYSTEM SHALL preserve current HeyGen behavior.

## Test Plan

- Constants tests for model key, brand, capability, aspect ratios, and BYOK mapping.
- BYOK service tests for Argil provider chrome and API-key validation.
- Argil service tests for API-key resolution, project payload, render dispatch, catalog reads, and status parsing.
- Argil provider tests for input validation and status mapping.
- Webhook verification tests for valid, invalid, malformed, and replayed callback tokens.
- Webhook service tests for clip success, clip failure, target mismatch, missing target, and idempotent terminal delivery.
- Clip provider-contract, DTO, queue, MCP tool-schema, and Studio Clips component tests for `argil` support.
- Local MacBook verification is limited to formatting, linting, architecture guards, and staged secret scanning; typecheck, tests, and build run in PR CI.
