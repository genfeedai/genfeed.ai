---
name: x author reply loop
description: Feature-complete author-reply conversation loop for X (comment_responder + inbox + harness + closed-loop memory)
type: project
status: active
last_verified: 2026-08-12
topics: [harness, twitter, x, reply-bot, content-memory]
---

# Replies surface (product)

## Goal

Reply to comments on **your** posts. Product name is just **Replies** (not “author-loop” jargon). Maps to Heavy Ranker conversation signals — not reply-guy and not @grok tags.

## Surfaces

| Layer | Path |
| --- | --- |
| API ensure / inbox / draft / send | `POST/GET /reply-bot-configs/author-reply/*` (internal) |
| Service | `AuthorReplyLoopService` |
| Harness in replies | `ReplyGenerationService` + `HarnessGenerationService` |
| Auto | `comment_responder` bot + cron |
| Closed-loop metric | `content_performance.data.authorClosedLoops` |
| Winners ranking | X score + closed-loop boost |
| App UI | Automate → **Replies** (`/automate/replies`) |
| Promote memory | Settings → Harness → **Promote winners to memory** |

## Operator flow

1. Connect X credential on the brand.  
2. Automate → **Replies** → **Enable auto-replies**.  
3. Refresh inbox (24h unreplied comments on your posts).  
4. **Draft** / **Send reply**.  
5. Weekly: promote winners from harness settings.

## Feature flag

Reply bot routes still sit behind `reply_bot` feature flag on the controller.
