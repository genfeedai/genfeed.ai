# BFL direct image contract

Reviewed against official BFL documentation on **2026-10-02**. This is a compiler and credential-bound HTTP client leaf; it does not activate models, route accounts, save assets, charge credits, or register a platform.

| Reviewed model | Modes | References | Controls | Cancellation |
| --- | --- | --- | --- | --- |
| `flux-2-pro` (fixed snapshot) | `text-to-image`, `image-edit` | Generation: zero; edit: one through eight tenant-admitted images | Prompt, optional width/height, optional seed; fixed JPEG output | Unsupported |

The compiler posts to `https://api.bfl.ai/v1/flux-2-pro` with `x-key`, `prompt`, optional `width`, `height`, `seed`, `input_image` through `input_image_8`, and `output_format: jpeg`. Dimensions are safe integers at least 64; the current model OpenAPI does not specify a maximum or multiple-of requirement. Seed is a safe integer; the current schema supplies no signedness or range restriction. Dimensions are omitted when unspecified so provider defaults apply. Aspect ratio, resolution, duration, unsupported models/modes, invalid references and extra prepared-body fields fail before submission. References must already have passed tenant-scoped admission; HTTPS syntax validation here does not perform asset authorization.

Submission requires both `id` and `polling_url`. Polling preserves the returned URL and admits only the officially documented origins `https://api.bfl.ai`, `https://api.eu.bfl.ai`, and `https://api.us.bfl.ai`, exact `/v1/get_result`, and one matching `id` query parameter. Plain HTTP, other hosts/IPs, credentials, ports outside HTTPS defaults, extra/key-bearing queries, mismatched IDs, fragments and redirects fail closed. Undocumented cluster origins require verified official evidence and a reviewed allowlist update; they are not admitted by a wildcard. Prepared provider/model/version/endpoint/body are checked before attaching credentials or calling the submission marker.

`Pending` is queued; `Reasoning`/`Generating` are running. `Ready` must carry a valid HTTPS `result.sample` URL under `delivery.*.bfl.ai`. `Failed`, `Error`, request/content moderation and missing tasks produce explicit redacted failures; unknown/malformed statuses never imply success. The URL is returned unchanged, without fetching it or attaching account credentials. **BFL delivery URLs expire after 10 minutes.** The root orchestrator must promptly download and persist the image into the admitted tenant's durable asset store, then serve that durable asset. This client cannot refresh expired URLs or infer expiry from opaque signature parameters and never claims that a returned URL is already a saved asset.

Credential validation uses nonpaid `GET https://api.bfl.ai/v1/credits`, requires a finite numeric credit balance, and accepts zero credits as a valid credential. Missing credentials fail locally, with no fallback account or environment credential. Remote cancellation is not documented and returns `unsupported`; aborting a request does not cancel generation. The shared transport applies a 30-second request deadline, disables redirects/retries, classifies credit/rate/auth failures, and strips provider bodies and raw exceptions. An unconfirmed POST or malformed acknowledgement is marked submission-uncertain so orchestration can reconcile without blindly spending again.

Official sources:

- [FLUX.2 pro generation/edit OpenAPI](https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-[pro].md)
- [Generation quick start, regions, output expiry and credit/rate limits](https://docs.bfl.ai/quick_start/generating_images)
- [Integration guide and delivery hosts](https://docs.bfl.ai/api_integration/integration_guidelines)
- [Get-result OpenAPI and status enum](https://docs.bfl.ai/api-reference/utility/get-result.md)
- [Nonpaid credits endpoint](https://docs.bfl.ai/api-reference/get-the-users-credits.md)

Mocked compiler/client specs exercise the real exported entry points. Hosted verification and required independent review remain delivery gates; no paid live request was made. Remaining full-issue acceptance includes root account/credential binding, durable reconciliation after uncertain submission, prompt output persistence, tenant-scoped download/access controls, saved-asset integration, lifecycle/billing behavior and authorized live BFL acceptance (including any returned undocumented polling cluster). Leaf completion alone does not close the full integration issue.
