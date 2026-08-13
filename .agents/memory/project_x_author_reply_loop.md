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
| App UI | Messages → **Replies** (`/messages/replies`) |
| Promote memory | Settings → Harness → **Promote winners to memory** |

## Operator flow

1. Connect X credential on the brand.  
2. Automate → **Replies** → **Enable auto-replies**.  
3. Refresh inbox (24h unreplied comments on your posts).  
4. **Draft** / **Send reply**.  
5. Weekly: promote winners from harness settings.

## Feature flag

Reply bot routes still sit behind `reply_bot` feature flag on the controller.

## Comment read path (X)

1. **Official first** — `TwitterService.getTweetReplies` via `tweets/search/recent` + `conversation_id:{tweetId}` (brand OAuth when available, else app bearer).  
2. **Apify fallback** — only when official throws or returns empty (tier/search not available).  
3. **Write** — always brand OAuth via `BotActionExecutorService.postReply`.

Timeline listing already preferred official API the same way.

## Age + intents

- **Default max age:** 24h (hard cap 48h) on comments and parent posts.  
- **Intents:** `thanks` | `question` | `troll` | `spam` | `default` via `reply-intent.util.ts`.  
- Auto skips **spam**. Troll persona is controlled wit (not report-bait).  
- UI: Automate → **Replies** shows intent badge + override select.
