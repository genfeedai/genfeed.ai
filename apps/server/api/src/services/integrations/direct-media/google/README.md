# Reviewed Google direct media leaf

Contract reviewed against official sources on 2026-10-02. These framework-neutral
compiler/client leaves do not activate a provider, change defaults, select an
account, or fall back to an aggregator/platform credential.

| Exact model | Modes | Reviewed controls | References | Lifecycle |
| --- | --- | --- | --- | --- |
| `gemini-3.1-flash-image` (Nano Banana) | Text to image, image edit | Documented image ratios; image size `512`, `1K`, `2K`, `4K` | 1–14 for editing; admitted HTTPS image URI or inline PNG/JPEG/WebP | Synchronous Interactions output |
| `gemini-omni-1.1-flash` | Text to video, image to video | `16:9`, `9:16`; `720p`, `1080p` (upscaled) | One starting image | Synchronous Interactions, explicit inline delivery |
| `veo-3.1-generate-preview` | Text to video, image to video | `16:9`, `9:16`; 4/6/8 seconds; `720p`, `1080p`, `4k`; higher resolutions require explicit 8 seconds | One inline PNG/JPEG/WebP starting image | `predictLongRunning`, exact returned operation polling |

Veo remote asset retrieval/inline admission belongs to the account-bound media
layer; this compiler rejects remote Veo references rather than fetching arbitrary
URLs. Width, height, seed, unreviewed controls, extra fields, unsupported modes,
reference counts, and model aliases fail before submission. Omni duration control
is not enabled merely because the generic API schema contains a duration field.
Omni's additional documented resolutions and two-frame modes remain outside this
reviewed scope.

The API key stays in the ephemeral context and `x-goog-api-key` header. Requests
never retry or follow redirects. Provider errors retain safe categories only.
Synchronous Nano/Omni results parse REST `steps[].content[]` under `model_output`;
SDK convenience properties are not used. No background recovery is claimed for
those models. Missing/malformed media after a POST is submission-uncertain.

Veo operation names and polling URLs must match the exact reviewed Google origin
and model path. Output URLs accept only protected Google Files paths, omit
embedded credentials, and carry `requiresCredential: true`. The original account
key must be used by the downstream output downloader. URI Interactions output
also needs Files readiness handling there; inline Omni is requested to avoid
creating a separate Files polling lifecycle in this leaf. Remote cancellation is
unsupported for all three models; aborting HTTP does not cancel provider spend.
Credential validation reads model metadata and never makes a paid generation call.

Sources:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/omni
- https://ai.google.dev/api/interactions
- https://ai.google.dev/gemini-api/docs/veo
- https://ai.google.dev/api/models
- https://github.com/googleapis/python-genai/blob/main/google/genai/models.py
  (official Google SDK REST mapping: image bytes and MIME fields)

The two Vitest spec files were authored before implementation and exercise the
real compiler/client using injected, mocked fetch. They were not executed red on
the restricted VM. Hosted affected API tests/typechecks and final-head CI remain
required; scoped Biome and diff/secret scans are separate checks. No live paid
calls were made. Gen/Sonnet review is unavailable and is not reported as passing.

Remaining application gates include explicit account/platform binding, durable
submission uncertainty/recovery, tenant asset admission, account-bound protected
output downloading and saved assets, retry/billing policy, and lifecycle routing.
This contract leaf does not complete issue #4595's full application scope.
