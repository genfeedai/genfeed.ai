---
name: x algorithm harness
description: X/Twitter open-source ranking signals mapped into platform harness craft + winner scoring
type: project
status: active
last_verified: 2026-08-12
topics: [harness, twitter, x, ranking, content-memory]
---

# X algorithm → Genfeed harness (platform pack)

## Decision

**Do not build a separate “X ranking product.”** Encode open-source For You signals into:

1. **`platform-x` harness pack** — craft rules when `intent.platform` is X/Twitter  
2. **Public-metric winner scoring** — re-rank brand `ContentPerformance` for promote/memory  
3. **pgvector content memory** — store those winners as few-shots for the next gen

We **cannot** run Phoenix over the global X corpus. We **can** use what the algo optimizes for to define “good X content” for *our* brands.

## Sources

| Source | What we use |
| --- | --- |
| [twitter/the-algorithm-ml Heavy Ranker](https://github.com/twitter/the-algorithm-ml/blob/main/projects/home/recap/README.md) | Explicit 2023 weights (reply 13.5, author-engaged reply 75, fav 0.5, …) |
| [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) | Phoenix multi-action predict (like/reply/repost/quote/dwell/… vs block/mute/report); no hand features |

Production weights change. Durable lesson: **conversation + depth + share > vanity likes; negative feedback is catastrophic.**

## Code

| Piece | Path |
| --- | --- |
| Weights + pack + `scoreXPublicMetrics*` | `packages/harness/src/platforms/x-algorithm.ts` |
| Registry load | `ContentHarnessService` registers `X_PLATFORM_HARNESS_PACK` always |
| Winner promote reorder | `HarnessWinnerPromotionService.rankPerformersForPromotion` |

## Finding “good content on X”

| Approach | Status |
| --- | --- |
| Own brand posts + algo-weighted score → promote-winners → embed | **Shipped path** |
| Human-curated examples in private packs / #2837 | Required for taste |
| Scrape global For You / run Phoenix | Out of scope (no infra, no training data) |
| X API timeline of accounts we follow as inspiration library | Future: feed into context bases, not a second vector SaaS |

## Public metric proxy (honest limits)

| Metric we store | Proxy for |
| --- | --- |
| `comments` | `P(reply)` |
| `shares` | `P(repost)` |
| `saves` | high-intent / bookmark-like |
| `likes` | `P(fav)` (weakest positive) |
| missing | author-reply loop (75×), 2-min dwell, report/block |

## Operator

Generate with `platform: twitter` or `x` → pack injects.  
Periodically promote winners so memory holds conversation-heavy posts, not only like spikes.
