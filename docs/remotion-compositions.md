# Render an approved Remotion composition

The `product-story` composition creates a branded video with a title, one to three
benefits, and a call to action. Each scene lasts four seconds. It supports portrait
(1080 × 1920), landscape (1920 × 1080), and square (1080 × 1080) video at 30 fps.
Rendering uses the existing editor video queue and saves the completed result in
the brand's assets. It does not call a generative-video provider.

## Discover and submit

Authenticated clients read `GET /remotion-compositions` for the current composition
version, renderer version, input schema and output settings. Read the renderer
version from this catalog rather than assuming that a previously cached version
is still supported.

Submit `POST /remotion-compositions/render` with structured inputs:

```json
{
  "compositionId": "product-story",
  "version": "1",
  "rendererVersion": "remotion@4.0.521",
  "requestId": "launch-story-2026-09-08-v1",
  "brandId": "YOUR_BRAND_ID",
  "brandName": "Your brand",
  "title": "Meet your next creative assistant",
  "benefits": ["Turn ideas into stories", "Keep your brand consistent"],
  "callToAction": "Create your first story",
  "format": "portrait",
  "accentColor": "#173c49"
}
```

An optional `sourceVideoId` adds silent background footage. It must identify an
accessible video in the same organization and brand, with enough duration for all
scenes. Raw source URLs and executable composition code are not accepted. Omit
this field to use the accent color as the background.

The response is a JSON:API render receipt. Its `id` identifies the persisted editor
project; `jobId` identifies the current render attempt. Repeating the same request
with the same `requestId` recovers that receipt. Changing inputs requires a new
`requestId`. This prevents a lost HTTP response from generating another video.

## Follow the render

Read `GET /remotion-compositions/:id` until the state is `completed`, `failed`, or
`cancelled`. Queued and active renders expose their current state and available
progress. Completed receipts include `assetId` and `assetUrl`. A queue job reporting
completion does not count as a completed asset until canonical asset persistence
has finished.

Use `POST /remotion-compositions/:id/cancel` to cancel active work. Use
`POST /remotion-compositions/:id/retry` for failed or cancelled work. Retrying a
completed render returns its existing asset. Failed attempts remain failed assets;
only the successful current attempt is linked as the completed project output.

Approved composition projects retain immutable inputs and provenance. To make a
revision, submit changed inputs with a new request ID. Composition identity and
version, renderer version, request identity and source asset IDs live in project
provenance; the output asset also records its composition, template version,
renderer and source action.

## Workflows and agents

The workflow action catalog exposes these same operations:

| Action | Input | Result |
| --- | --- | --- |
| `remotion.composition.catalog` | Empty object | Approved catalog |
| `remotion.composition.render` | The structured inputs above | Render receipt |
| `remotion.composition.status` | `projectId` from the receipt's `id` | Current receipt |
| `remotion.composition.cancel` | `projectId` | Current receipt |
| `remotion.composition.retry` | `projectId` | Current receipt |

The render node finishes when submission is tracked, not when video rendering is
complete. Follow it with a wait and status check; only pass `assetId` to subsequent
publishing or editing work after `status` is `completed`. The workflow runner uses
its stable run/node identity for submission retries. Agents authoring workflows
use the same action definitions, input validation, tenant checks and output
contract as the HTTP endpoints.

Run the API, workflow worker, files worker and their configured PostgreSQL, Redis
and asset-storage dependencies. The files worker must have the pinned Remotion
browser runtime available. No additional rendering service is introduced.
