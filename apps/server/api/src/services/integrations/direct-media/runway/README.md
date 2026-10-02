# Runway direct media leaf

Reviewed 2026-10-02 against [official API schema](https://docs.dev.runwayml.com/api.md), [models](https://docs.dev.runwayml.com/guides/models/), and [task failure guidance](https://docs.dev.runwayml.com/errors/task-failures/). Uses only `https://api.dev.runwayml.com`, bearer credentials, and `X-Runway-Version: 2024-11-06`.

| Model | Modes | Route | Contract |
| --- | --- | --- | --- |
| gen4.5 | text-to-video | POST /v1/text_to_video | integer 2–10 seconds; 1280:720 or 720:1280; no references |
| gen4.5 | image-to-video | POST /v1/image_to_video | one first-frame image; integer 2–10 seconds; adds 1104:832, 960:960, 832:1104, 1584:672 |
| gen4_image_turbo | text-to-image, image-edit | POST /v1/text_to_image | requires 1–3 referenceImages; all 16 documented ratios; optional uint32 seed |

All prompts require 1–1000 UTF-16 code units. The compiler requires an explicit supported pixel ratio (or matching width/height), rejects unsupported resolution/duration/reference controls, and accepts tenant-admitted HTTPS image references. URI tags, data URIs and Runway upload URIs are not exposed by this ABI. Prepared requests are revalidated before HTTP. References are never downloaded by this client. The aggregator route remains separate and unchanged; its unavailable schema is not evidence for the direct contract.

Credential validation uses the non-generation GET /v1/organization endpoint, including valid zero-credit accounts. Polling maps PENDING/THROTTLED/RUNNING/SUCCEEDED/FAILED/CANCELLED; provider failure text and codes are replaced by safe diagnostic categories. The root coordinator must enforce at least five seconds between task reads. Output URLs expire within 24–48 hours: root must download and persist outputs with original tenant/account binding, then expose saved assets through authorized access.

Cancellation first reads current state and never deletes a task known to be terminal. DELETE can cancel PENDING/THROTTLED/RUNNING, but deletes completed output: Runway provides no conditional cancellation, so a transition between GET and DELETE remains an unavoidable provider race. Successful DELETE means requested, not confirmed; only observed CANCELLED confirms cancellation. Terminal tasks return unsupported, and HTTP failures remain errors. An aborted local request never confirms remote cancellation.

No automatic retries or redirects; shared transport has a 30-second deadline and redacts response bodies/transport exceptions. Submission-start callback fires after preflight validation immediately before paid POST. Uncertain submission requires root reconciliation before retry, never blind resubmission.

This contract/client leaf does not activate a route or persist orchestration. Root still owns credential admission, tenant asset admission, durable external task/account/model binding, cadence, retry and billing policy, cancellation intent, output persistence, app flows and integration. Mocked real-entrypoint tests are authored first; execution is gated on hosted affected-API CI. Paid provider verification, complete app lifecycle, cross-chat integration review and gen/Sonnet review remain delivery gates. No paid calls were made.
