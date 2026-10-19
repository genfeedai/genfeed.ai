# Authorized tenant media delivery (#4895)

This change ships with delivery and preparation disabled. It does not attach a CloudFront trusted key group, change an S3 policy, alter a distribution, deploy an application, or run a production migration. #4895 remains open until the infrastructure and end-to-end acceptance below are verified.

## Policy

Cloud free accounts receive ready platform-watermarked image/video previews. Other unsupported media formats remain unavailable. Clean originals require the existing paid-plan entitlement from the canonical organization settings; an API key or admin identity adds no entitlement. Server publication and processing obtain short-lived execution capabilities after an organization-bound ingredient lookup. Self-hosted delivery retains its existing unrestricted behavior.

Public shares and OG media use separate persisted derivatives under `public/media/<organization>/<purpose>/<source-identity>`. Canonical ingredient or post public consent is checked on every grant and again after queue delay. Private originals are never a public fallback. Revoking consent prevents new grants; previously issued grants remain valid until their configured expiry.

## Prepare a rollout for approval

1. Deploy this code with `GENFEEDAI_MEDIA_ISSUER_ENABLED=false` and `GENFEEDAI_MEDIA_PREPARATION_ENABLED=false` to API, workers and Files. Apply the additive `20261003143000_authorized_media_delivery` migration through the repository migration guard. No object is rewritten by the migration.
2. Configure `GENFEEDAI_CDN_SIGNING_KEY_PAIR_ID`, `GENFEEDAI_CDN_SIGNING_PRIVATE_KEY` and `GENFEEDAI_CDN_SIGNED_URL_TTL_SECONDS` with a valid matching signing key pair and the agreed TTL (default 900 seconds). Keep delivery disabled. Check that API and worker startup validate the key pair and that shared runtime configuration agrees. Do not log key material.
3. Enable preparation only (`GENFEEDAI_MEDIA_PREPARATION_ENABLED=true`) in the approved test environment. Using an authenticated identity in each organization, batch `POST /ingredients/media-previews` with at most 50 ingredient IDs. For explicitly shared ingredients or ingredients in public posts, call `POST /ingredients/:id/public-derivative` separately with `purpose: public-share` and `purpose: public-og`. These requests enqueue durable work; GET requests never render media. The rate-limited public-grant GET may enqueue one missing durable variant after canonical public consent; repeated reads reuse its durable state and failed variants require authenticated recovery. Inspect variant readiness before delivery activation. Newly completed/publicly shared ingredients also schedule preparation.
4. Retain the existing shared/app `images.unoptimized=true` policy so Next image caching cannot extend a private capability. Verify a nonproduction distribution with the intended trusted key group, private original behavior and origin access controls. Confirm that existing objects under legacy ID-derived keys are covered by the private policy, not only newly randomized keys. Public derivative access must follow its purpose and signature policy. Request rollout approval before any CDN/distribution/S3 change.
5. Drain or explicitly requeue legacy editor, training and YouTube jobs before enabling delivery. Jobs produced with delivery disabled do not contain the canonical key mappings required by activated workers; stale URL-only jobs must fail closed.
6. After approval and readiness checks, enable `GENFEEDAI_MEDIA_ISSUER_ENABLED=true` consistently on API, Files and workers. This implies preparation is enabled. Newly allocated ingredient uploads and generated outputs use independent random object identities. Publishers reissue execution URLs on each attempt; no signed URL is persisted in the ingredient or variant rows.

## Required acceptance evidence

Unit and HTTP module tests cover canonical organization scope, free/API-key/admin denial, unavailable signatures, exact literal object keys, response projection, source revisions, preparation gating and browser refresh. A loopback-only, opt-in PostgreSQL 17/pgvector integration fixture applied the exact additive migration after the baseline schema and passed four cases covering tenant-guard queries, state/purpose constraints, unique identity, free/paid access, foreign/deleted records, raw keys, expiry and changed source identity. The unmocked Files configuration factory also passed default-off, cloud-on and self-hosted-off startup checks. These local results do not establish CDN behavior.

Before activation, the protected output-generation and output-quality owners must replace any remaining ID-derived or computed-clean media reads in their claimed source/mask admission, evaluation and quality-scoring surfaces with organization-bound execution hydration. This PR deliberately leaves those owner surfaces untouched. Queued editor, training and YouTube jobs now carry canonical keys authored only after scoped producer lookup; browser DTOs cannot supply those keys. Workers use the trusted service transport and sign exact keys at each attempt. Editor key maps are excluded from persisted provenance and HTTP responses. Legacy queued jobs still require the drain/requeue step above.

### Execution reads by surface

With delivery enabled, every server-side read of tenant media mints a short-lived grant from the stored key after an organization-bound lookup. An ID-derived path is never built. Reads that cannot be expressed that way are refused, not downgraded to an unsigned URL.

| Surface | Behaviour when delivery is enabled |
| --- | --- |
| Image edit and generation sources, masks, FLUX.3 references | `AuthorizedMediaUrlService.issueServerPublish`, in the granted character's owning organization for an admitted shared avatar |
| Image and video reference ids (`buildReferenceImageUrl(s)`) | Image ingredients through `issueServerPublish`, brand assets (reference, logo, banner) through `issueServerAssetUrls` |
| Video references and end frames | A video id used as an image reference is refused: no thumbnail key is stored once keys are random |
| Workflow image and video generation | The prepared provider input keeps the stable canonical URL, because it is hashed between quote and dispatch and a grant changes with its expiry. `WorkflowMediaProviderPlanService.authorizeProviderInput` replaces every internal media URL with a fresh grant immediately before the Replicate or Fal call (`issueExecutionUrls`: the organization's own media, plus a granted character's images for the run's brand). One unresolvable id fails the call; thumbnails and other internal paths with no key are refused |
<<<<<<< HEAD
| Generated-media notifications | The bot follow-up, the video thumbnailer and the operator Discord card get a short-lived grant from `PostProcessingOrchestratorService.authorizeProcessingUrl`; when delivery is authorized and no grant can be issued nothing is sent. The dev-only notification endpoint stays canonical because it is disabled in production |
| Editor clips and analytics top content | Response-only: rows that carry `ingredientId` with `ingredientUrl` are projected by the response interceptor like any other ingredient. The stored canonical clip URL is never trusted by the renderer, which resolves media from the organization's ingredients. Video rows have no signed thumbnail, so `thumbnailUrl` is null for them and the image itself for images |
| Content-orchestration image-to-video steps | An explicit `imageUrl` naming internal media is replaced by a grant (`issueExecutionUrls`, scoped to the run's organization, brand and caller) immediately before the provider call; another organization's media fails the step, external URLs pass through, and a missing issuer or caller fails closed. Admission still resolves the same id first |
=======
>>>>>>> origin/master
| Crun quotes | Every reference is refused. The frozen quote hashes and stores its input, so it cannot hold an expiring URL. Re-enable once quotes carry stored keys and sign at dispatch |

Before closing #4895, record nonproduction CDN checks for unsigned-original denial, cross-organization denial, expiry, URL/path tampering, literal `?`, `#`, `%2F` and whitespace keys, public-share revocation, and cached-response grant renewal. Measure first preparation latency, repeat-preview origin downloads and repeated list/bootstrap query counts. A ready variant must be reused without rendering or downloading its original again. Cache hits must receive fresh grants after authorization and must not retain another organization's grants.

## Recovery and rollback

A failed worker records `FAILED` with no variant key and retries with the queue's bounded backoff. Retry explicit preparation after correcting the cause; no request returns the original to disguise a missing preview. Changing source key/version/completion identity makes the old derivative ineligible.

Stop preparation independently with its flag when delivery is disabled. During an active rollout, pause workers or roll back application code only with the private CDN policy retained. Do not remove original protection or enable unsigned fallback as a recovery step. Disabling delivery returns the application to legacy URL behavior; under an enforced private CDN those unsigned legacy URLs can be unavailable. Prefer restoring the last working signing/issuer configuration. Previously issued CDN URLs expire at the configured TTL (default 900 seconds); internal S3 execution grants expire after 300 seconds, except editor-render grants renewed at each execution attempt, which expire after 900 seconds. Key revocation/invalidation is a separate infrastructure operation that requires approval.

## Guard against new ID-derived URLs

`bun run check:id-derived-media-urls` (part of `check:architecture`) counts
`${ingredientsEndpoint}/…` constructions in server code per file. Every
remaining one is listed with its reason (flag-off branch, stable hashed input
that is authorized at the provider call, or response-only), and a count that
grows or shrinks fails, so new media reads must issue a grant instead.
