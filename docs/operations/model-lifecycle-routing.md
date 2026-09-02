# Model lifecycle and dynamic routing

The model registry uses one operator-controlled lifecycle. `isDeleted` remains
soft deletion only; provider discovery review remains a separate approval gate.

| Lifecycle | Explicit selection | Auto routing | Successor |
| --- | --- | --- | --- |
| Recommended | Yes | Yes, when priced and reviewed | Not used |
| Available | Yes | No | Not used |
| Legacy | Yes, under the Legacy filter and search | No | Required |
| Retired | No; stored bindings resolve forward | No | Required |

`isDefault` is separate from lifecycle, but only an active Recommended model can
hold the default flag. Legacy remains callable for deliberate compatibility;
Retired is never sent to a provider.

## OpenRouter routes

`openrouter/auto` is an explicit registry row. Each request sends the current
priced, reviewed Recommended text-model set through the Auto Router
`allowed_models` plugin, maps generation priority to the current `cost_tier`
policy, enforces ZDR/data-collection denial, and uses the thread ID as
`session_id` for stable multi-round routing. The selected model is read from
`response.model`.

Before every agent LLM round the wallet reserves the route's maximum configured
credit envelope with a stable round idempotency key. OpenRouter Auto and Free
settle retail credits from `usage.cost`; when that field is absent the server
reads `/api/v1/generation` and uses `total_cost`. BYOK settles zero platform
credits. Settlement records the actual response model and releases the unused
hold atomically.

`openrouter/free` is labeled experimental and is explicit-only. OpenRouter
filters for request capabilities (including tools). A compatible-route failure
may fall back to the curated DeepSeek V4 Flash route; its actual model and paid
cost are then recorded and billed normally.

Automatic lifecycle mutation is disabled. Operators perform all transitions in
Admin → Models and must choose a valid same-category successor before moving a
row to Legacy or Retired.
