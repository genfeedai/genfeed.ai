# Higgsfield

Client for the documented Higgsfield REST catalog — the developer surface
behind an API key, the same role Replicate and fal.ai play in this repo.

## Contract

Verified against [docs.higgsfield.ai](https://docs.higgsfield.ai/docs) (2026-09-16),
not the JS SDK's typed `/v1/...` subset.

| | |
|---|---|
| Base URL | `https://api.higgsfield.ai` |
| Auth | `Authorization: Key <key-id>:<key-secret>` |
| Submit | `POST /<endpoint-id>` — input at the top level, **not** wrapped in `input` |
| Status | `GET /requests/{request_id}/status` |
| Cancel | `POST /requests/{request_id}/cancel` |
| Webhook | `?hf_webhook=<url-encoded callback>` on the submit URL |
| Statuses | `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled` |
| Output | `images: [{ url }]` for image jobs, `video: { url }` for video jobs |

`nsfw` and `canceled` are terminal rejections, not transient failures —
`waitForCompletion` raises a non-retryable `ACTION_NOT_ALLOWED`.

## Endpoints wired here

| Model key (endpoint id) | Body |
|---|---|
| `higgsfield-ai/soul/v2/standard` | `{ prompt, aspect_ratio, resolution, batch_size }` — batch 1 or 4 |
| `higgsfield-ai/dop/standard` | `{ prompt, image_url }` |
| `higgsfield-ai/dop/turbo` | `{ prompt, image_url }` |
| `higgsfield-ai/dop/lite` | `{ prompt, image_url }` |

Soul 2 is the current default Soul image model. DoP `standard` is the
documented video path; lite/turbo follow the same path pattern. DoP requires
a source still (`requiresFirstFrame`).

## Credentials

`HIGGSFIELD_API_KEY` / `HIGGSFIELD_API_SECRET` are the platform-wide fallback.
Organizations with `ByokProvider.HIGGSFIELD` configured use their own key.
Missing key or secret fails closed before the request is sent. BYOK validation
probes `GET /v1/text2image/soul-styles/v2`.
