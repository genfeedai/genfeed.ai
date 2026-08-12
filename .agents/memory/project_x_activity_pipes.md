---
name: x activity pipes
description: XAA/AAA webhook + delayed post-watch + inbound queue pipes (connect later)
type: project
status: active
last_verified: 2026-08-12
topics: [replies, x, webhooks, queues]
---

# X Activity + post-watch pipes

## Architecture

```
XAA/AAA webhook ──► POST /v1/webhooks/x-activity ──► reply-inbound queue
Publish hook     ──► schedule-post-watch (delayed) ──► reply-post-watch queue
                                                      └──► fetch comments ──► reply-inbound
reply-inbound ──► classify intent ──► auto-send if bot enabled ──► dedupe processed
Poll cron (existing) remains as backfill
```

## Env (connect later)

| Variable | Purpose |
| --- | --- |
| `X_ACTIVITY_WEBHOOK_ENABLED=true` | Process events (default off = accept + no-op) |
| `X_WEBHOOK_CONSUMER_SECRET` or `TWITTER_CONSUMER_SECRET` | CRC HMAC |
| Register webhook URL | `https://api…/v1/webhooks/x-activity` |

## Queues

- `reply-inbound` — one comment job  
- `reply-post-watch` — delayed series (2m…24h)  

## APIs

- `GET/POST /webhooks/x-activity` — public CRC + events  
- `POST /reply-bot-configs/author-reply/schedule-post-watch` — start 24h watch series  

## Wired

- **Post-publish** (`CronPostsService`): after successful X publish → `schedulePostWatch`  
- **Enable auto-replies**: best-effort `XActivitySubscriptionService.ensureSubscriptionForUser`  
- **YouTube**: `ensureAuthorResponder({ platform: 'youtube' })` (48h age); comments still Apify until official YT path  

## Still connect-later

- Register webhook with X Developer Console  
- Flip `X_ACTIVITY_WEBHOOK_ENABLED` + bearer + public URL  
- Confirm PAYG subscription limits for multi-brand  
