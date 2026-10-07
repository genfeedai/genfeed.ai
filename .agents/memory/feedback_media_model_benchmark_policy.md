---
name: media_model_benchmark_policy
description: FLUX.1 is legacy for production; dated task-specific benchmarks guide media recommendations
type: feedback
last_verified: 2026-10-07
---

**Rule:** Keep hosted FLUX.1 endpoints, including Schnell, as legacy explicit
choices in production when active with approved pricing. Keep uncurated rows
inactive until pricing and activation are approved. Cheap defaults belong to
non-production development, test and staging environments. Self-hosted production uses current quality
media defaults too. Preserve operator choices and existing stored model keys.

**Why:** The operator reported poor Schnell outputs and requested legacy
placement except for local development. Independent image preference evidence
supports excluding it from production Auto; low price and low inference-step
count are insufficient quality evidence.

**How to apply:** Read [media model benchmark policy and dated evidence](../../../docs/media-model-benchmarks.md)
before changing image/video recommendations. Use exact task/version/settings,
retrieval date, score intervals and samples; distinguish curated defaults from
benchmark leaders. Pair independent human-preference boards with product-prompt
qualification, provider latency and cost per accepted output. Treat unmatched
variants and unmeasured speed as unverified. Refresh after 30 days or a model/
benchmark revision. The DB registry remains the runtime source of truth; no
automatic promotion from fetched leaderboard scores.
