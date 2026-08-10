---
name: Messages Engagement Surfaces Decisions
description: Module-scope and ingestion tradeoffs for issue 2742
type: project
status: active
last_verified: 2026-08-10
---

# Messages Engagement Surfaces Decisions

## Optimization Target

One engagement inbox whose comment and DM workflows stay coherent — shared
automation states, review queue, tenant scoping, and the comment → DM
escalation flow — while each type gets a presentation fit for its shape.

## Considered Approaches

1. Split Comments and DMs into two modules (or two top-level routes).
   - Matches the page map's old "global social DM" wording, but duplicates
     automation states, review queues, filters, and realtime plumbing, and
     breaks the Instagram comment → DM escalation, which is a
     single-conversation flow today.
2. Keep the status-only mixed list (status views only, no type dimension).
   - Zero new UI, but comment triage (post-anchored, high volume) and DM
     conversations (threaded, low volume) have divergent working patterns;
     mixing them makes both worse, and the DM surface stays invisible.
3. One module with `conversationType` as a first-class surface segment.
   - The backend contract already exists (`SocialInboxQueryDto.conversationType`
     — accepted, never sent by the frontend); the UI cost is a sidebar segment
     plus a DM thread presentation.

## Decision

Approach 3. Comments and DMs are segments of one Messages inbox on both the
org and brand routes. Mentions stays a reserved enum value with no tab until a
producer exists.

## Ingestion: Polling Before Webhooks

Instagram inbound (comments and DMs) ships as Graph API polling behind sync
endpoints, matching `POST /social-inbox/youtube/sync`. Meta webhook
subscriptions need app-review scopes and receiver infrastructure that no
integration in the repo has today; polling reuses the credential, dedup, and
scoping patterns already proven for YouTube. Webhooks remain a later
optimization, not a prerequisite.

## Escalation Provenance

`sendDm` today attaches the outbound DM message to the originating comment
conversation, with provenance recorded. That behavior is kept: the escalation
context lives where the operator acted. Inbound DM replies from the same
participant thread into a DM conversation keyed by the Graph conversation id —
the DM segment owns ongoing conversations, the comment segment owns the
escalation record.

## Page Map Correction

`reference_app_page_map.md` called Messages "a full app/module for global
social DM"; the implementation is an engagement inbox where comments are the
live half. The note now reads "global social engagement (comments + DMs, one
inbox)" so the map matches both the data model and this spec.
