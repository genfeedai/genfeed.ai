---
name: Messages Engagement Surfaces
description: Comments and DMs as first-class surfaces of one Messages inbox module
type: project
status: active
last_verified: 2026-08-10
---

# Messages Engagement Surfaces Spec

## Purpose

Make Messages the single engagement inbox that manages both comments and DMs
as first-class surfaces of one module, and make the DM surface real by landing
Instagram inbound ingestion. Issue #2742.

## Non-Goals

- X, LinkedIn, and Unipile ingestion (remainder of #1163).
- A Mentions surface producer — the enum value is reserved; no tab ships until
  a producer exists.
- Meta real-time webhooks — polling sync first, matching the YouTube pattern.
- Reply-campaign behavior changes
  (`social-reply-campaign*` services stay untouched).
- New routes or modules outside `/messages`.

## Interfaces

- The Messages sidebar on both `/:orgSlug/~/messages` and
  `/:orgSlug/:brandSlug/messages` gains a type segment — Comments | DMs — that
  sends the existing `conversationType` param on `GET /social-inbox`
  (`SocialInboxQueryDto` already accepts it; the frontend never sends it today).
- The type segment composes with the existing status views
  (inbox/unread/review/resolved/archived) and the platform, brand, automation,
  credential, owner, and search filters in `use-messages-inbox-filters.ts`.
- Comment conversations keep their source-content anchor
  (`sourceContentUrl/Title/Type` are already stored); DM conversations render
  thread-style without a post anchor.
- Instagram comments ingest through the shared
  `SocialInboxIngestionService.ingestInboundMessage` path with
  `conversationType: 'comment'`, sync-endpoint parity with
  `POST /social-inbox/youtube/sync`. The Instagram service gains a Graph API
  media-comment listing method (it has reply/post methods but no listing today).
- Instagram DM conversations ingest through the same path with
  `conversationType: 'dm'`, keyed by the Graph conversation id as
  `externalConversationId`, via a Graph API conversation listing method.
- Availability on DM threads: `canPostReply` is false with a reason;
  `canSendDm` is true when a participant external id exists
  (`social-inbox.helpers.ts` `getAvailability`).

## Key Decisions

- One module; conversation type is a surface segment, not a route or module
  split (full rationale in the decisions file).
- Polling sync before webhooks, same as YouTube.
- No per-platform inbox forks — every platform normalizes through
  `ingestInboundMessage` (mirrors #1163 requirement 6).
- Comment → DM escalation keeps its existing shape: the outbound DM message
  stays on the originating comment conversation. Inbound DMs from the same
  participant land in a DM conversation keyed by the external conversation id.

## Edge Cases and Failure Modes

- Switching the type segment resets conversation pagination to page 1; status
  view and filters persist across the switch.
- A re-run sync never duplicates conversations or messages — dedup on external
  ids follows the batched YouTube pattern
  (`findExistingYoutubeExternalIds` equivalent per platform).
- A DM conversation with no participant external id disables DM send with a
  reason instead of failing at action time.
- Instagram Graph rate limits or token expiry record the failure and leave
  existing conversations untouched; the sync response reports created counts
  only for net-new records.
- Tenant scope (`{ organizationId, isDeleted: false }`) applies to every
  conversation and message read/write, as everywhere else in the collection.

## Acceptance Criteria

- WHEN the Messages surface is opened THE SYSTEM SHALL present Comments and
  DMs as segments of one inbox sharing status views, filters, and pagination.
- WHEN a type segment is selected THE SYSTEM SHALL query conversations through
  the existing `conversationType` contract while preserving all other active
  filters.
- WHEN Instagram comments are synced THE SYSTEM SHALL normalize them through
  the shared ingestion path without creating duplicates on re-run.
- WHEN Instagram DM conversations are synced THE SYSTEM SHALL create or update
  DM conversations keyed by the external conversation id without duplicates.
- IF a conversation is a DM thread THE SYSTEM SHALL disable post-reply with a
  reason and permit DM send only when a participant external id exists.
- WHEN a comment conversation is escalated by DM THE SYSTEM SHALL keep the
  outbound DM and its provenance on the originating conversation.

## Test Plan

- Frontend: extend `use-messages-inbox-filters.test.ts` for the type segment
  (state, reset-on-switch, param wiring) and the sidebar/page tests for
  segment rendering and DM thread presentation.
- Backend: ingestion idempotency fixtures per platform (re-run sync → zero new
  records), availability fixtures for DM threads in
  `social-inbox.helpers.spec.ts`, controller specs for new sync endpoints
  following `social-inbox.controller.enqueue.spec.ts` patterns.
- PR CI owns tests, typechecks, and builds on this MacBook.
