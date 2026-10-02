# Direct xAI media leaf

Reviewed against official xAI documentation on 2026-10-02. This compiler and
client use the direct `xai` account identity and bearer credential supplied in
request context. They do not register or activate a runtime route, change
funding/defaults, or affect OpenRouter `x-ai/` names or social X credentials.

| Model | Modes | References | Controls |
| --- | --- | --- | --- |
| `grok-imagine-image-2.0` | text-to-image, image-edit | none for generation; 1–5 for editing | documented image aspect ratios; 1k/2k resolution |
| `grok-imagine-video-1.5` | text-to-video, image-to-video | none for text; exactly one starting image | integer duration 1–15 seconds; 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3; 480p/720p/1080p |

Single-image editing uses JSON `image: {url, type: "image_url"}`; multiple
images use the mutually exclusive `images` array in source order. References
must already have passed tenant asset admission; this leaf additionally rejects
non-HTTPS URLs and embedded credentials. It accepts JPEG/PNG/WebP MIME types
when supplied. Width, height, seed, quality, batch count, base64/file references,
audio controls, reference-to-video, edit-video, and extra caller fields fail
closed. Provider defaults apply to omitted supported controls.

Image generation/editing is synchronous. Video submission returns a request ID;
polling reconstructs the provider URL from a validated ID and handles pending,
done, failed and expired. Output URLs are temporary. Image URL/base64 outputs
and moderated video outputs are parsed without retaining provider metadata or
error bodies. Remote cancellation is unsupported; aborting local HTTP transport
never confirms provider cancellation.

Credential validation uses `GET /v1/api-key`, requiring explicit unblocked,
enabled key/team flags, a model wildcard or a supported model ACL, and the
endpoint wildcard ACL shown in official docs. Narrow endpoint ACL syntax is
not yet verified; keys with such ACLs conservatively fail validation. Successful
HTTP status alone is insufficient. Missing credentials never fall back to a
platform account.

All POST requests use the shared transport's 30-second deadline, disabled
redirects, redacted errors, and zero automatic retries. The submission callback
runs after all local validation immediately before POST. An unreadable or
unusable successful POST result is marked uncertain; callers must reconcile
existing submissions before deciding whether to spend again.

Sources:

- https://docs.x.ai/developers/model-capabilities/images/generation
- https://docs.x.ai/developers/model-capabilities/images/editing
- https://docs.x.ai/developers/model-capabilities/images/multi-image-editing
- https://docs.x.ai/developers/model-capabilities/video/generation
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://docs.x.ai/developers/rest-api-reference/inference/images.md
- https://docs.x.ai/developers/rest-api-reference/inference/videos.md
- https://docs.x.ai/developers/rest-api-reference/inference/other.md

Remaining delivery gates: runtime account selection and tenant asset admission,
route/module wiring, durable provider IDs and uncertain-submission recovery,
protected output ingestion, workflow cancellation semantics, credit settlement,
required hosted tests/typechecks and review. No paid live call has been made.
Live image/edit/video acceptance with an explicitly authorized account remains
a launch gate. GenSonnet review is unavailable and is not a PASS.
