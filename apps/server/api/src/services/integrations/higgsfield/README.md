# Higgsfield

Client for the **Higgsfield platform API (v2)** — the developer surface behind
an API key, the same role Replicate and fal.ai play in this repo.

## Contract

Everything here is verified against the official SDK
([`higgsfield-ai/higgsfield-js`](https://github.com/higgsfield-ai/higgsfield-js),
`src/v2/`), which is the authoritative source for the wire format.

| | |
|---|---|
| Base URL | `https://platform.higgsfield.ai` |
| Auth | `Authorization: Key <key-id>:<key-secret>` |
| Submit | `POST /<endpoint>` — input at the top level, **not** wrapped in `input` |
| Status | `GET /requests/{request_id}/status` |
| Cancel | `POST /requests/{request_id}/cancel` |
| Webhook | `?hf_webhook=<url-encoded callback>` on the submit URL (no shared secret — v2 sends the URL only) |
| Statuses | `queued`, `in_progress`, `completed`, `failed`, `nsfw` |
| Output | `images: [{ url }]` for image jobs, `video: { url }` for video jobs |

`nsfw` is a terminal rejection by the safety filter, not a transient failure —
`waitForCompletion` raises a non-retryable `ACTION_NOT_ALLOWED`.

## Endpoints wired here

| Model key | Endpoint | Notes |
|---|---|---|
| `higgsfield-ai/soul` | `/v1/text2image/soul` | Batch of exactly 1 or 4; renders one of 13 fixed sizes, so the requested aspect ratio is snapped in `toSoulSize` |
| `higgsfield-ai/dop-lite` | `/v1/image2video/dop` | `model: dop-lite` |
| `higgsfield-ai/dop-turbo` | `/v1/image2video/dop` | `model: dop-turbo` |
| `higgsfield-ai/dop-standard` | `/v1/image2video/dop` | `model: dop-standard` |

DoP derives framing and length from the source image. The endpoint takes
**no** aspect-ratio or duration input, which is why those capability rows carry
neither `aspectRatios` nor `durations`.

`/v1/speak/higgsfield` (audio-driven video) is part of the same API but is not
wired: it needs an input audio URL, and nothing upstream carries one yet.

## Adding a model

A new tier is a row in `helpers/higgsfield.catalog.ts` plus matching
`MODEL_KEYS` and `MODEL_OUTPUT_CAPABILITIES` entries — `submit()` is generic
over the endpoint and posts the input verbatim, so the service does not change.

Higgsfield advertises a much larger catalog (their CLI's generated `MODELS.md`
lists 60+ `job_set_type` models — Veo, Kling, Seedance, Nano Banana, FLUX.2…).
That catalog is exposed through `console.higgsfield.ai`, whose per-model HTTP
endpoint paths are not covered by the SDK types, so only the endpoints above
are wired. Confirm a path against the live docs before adding a row.

## Credentials

`HIGGSFIELD_API_KEY` / `HIGGSFIELD_API_SECRET` are the platform-wide fallback.
Organizations with `ByokProvider.HIGGSFIELD` configured use their own key —
routing is by the `higgsfield-ai/` model-key prefix in `byok-provider-map.util`.
