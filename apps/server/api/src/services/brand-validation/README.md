# Brand artifact validation core

This internal API leaf binds captured artifact bytes to canonical snapshot and
artifact metadata. Its only application caller is the branded text seam
(`BrandedTextGenerationService`, direct post drafts).
`BrandValidationReceiptService.validateReceipt(actor, receiptId)` (exported by
`BrandValidationReceiptModule`) is the persisted completion adapter. The
synthetic corpus is regression input, never provider qualification or production
improvement evidence.

`BrandValidationService.preflightBrandCapabilities(input)` returns validator
capability admission and actionable diagnostics before generation. It does not
verify provider/model availability, quote a request, or dispatch work.
`validateBrandArtifact(input)` returns a canonical report asynchronously; capture,
hashing and the text evaluation complete synchronously before its promise is
returned, and the pixel proof for media runs on the already captured bytes. The module exports the dependency-free service without application
registration.

| Input or rule | Current behavior |
| --- | --- |
| Complete standalone text, nonempty mandatory/avoid literal | NFC and CRLF matching; exact case-sensitive substring pass/fail |
| Semantic or empty literal | Unknown with explicit capability reason |
| Multipart text or image/video text | Unknown text coverage |
| Brand OS fact rules (`generationRules.facts`) | Always unknown |
| Hard `system:factual_coverage` of the draft's claims (#6717) | Unknown until the fact check runs (see below); then pass, unknown or hard fail |
| Palette color on a single final image or video (#6727) | Pixel proof: pass or fail, else unknown (see below) |
| Font/logo/product/other visual asset | Unsupported without qualified artifact-bound evidence |
| Owner-excluded medium | Not applicable; absent applicability is universal |

Every report includes the hard `system:factual_coverage` check, `unknown` unless the
fact check below decided it, and `quality: null`.
No reference byte hash proves asset placement, actual font use or visual
compliance. For text, required unavailable capabilities block preflight and optional
ones warn. Image and video are admitted for review only (#6727): the preflight warns
with `artifact_media_unsupported` and every unprovable visual or text-coverage rule
(required or not) warns instead of blocking, because the report keeps those checks
`unknown`/`unsupported` and the hard `system:factual_coverage` unknown, so a media
receipt can only resolve to `needs_review`/`unverified`, never `ready`/`passed`. A
member approves the visuals in the review queue. Unsupported reasons are
`fact_grounding_unavailable`, `semantic_validation_unavailable`,
`empty_literal_rule`, `text_coverage_incomplete`, `exact_palette_unavailable`,
`exact_font_unavailable`, `exact_logo_unavailable`, `exact_product_unavailable`
and `exact_asset_unavailable`. Reports also disclose
`factual_coverage_unverified`, `artifact_media_unsupported`, and required literal
failures through `brand_rule_failed`.

## Palette pixel proof (images and video)

For an `image` or `video` artifact, each applicable palette rule is decided from the
final bytes, after the part hashes are verified, with no provider or network call.
`sharp` decodes a still (raster formats only; SVG and documents are rejected) to at
most 256 px on the long edge in sRGB RGBA. A video is sampled at four evenly spaced
times with the platform `ffmpeg` (`ffmpeg-static`, which honors `FFMPEG_BIN`); every
sampled frame must decode.

Opaque pixels (alpha 128 or more) are compared with the approved color by CIEDE2000.
A pixel within `maxDeltaE` 8 counts as that color. The color is present when it
covers at least `minCoverage` 1% of opaque pixels across all analyzed frames
(`ciede2000-presence-v1`, constants in `brand-validation-palette.util.ts`).

| Outcome | When |
| --- | --- |
| `pass` (`deterministic_render`) | coverage at or above the minimum |
| `fail` (`palette_color_absent`) | decoded, at least 1024 opaque pixels, coverage below the minimum |
| `unknown` `artifact_undecodable` | no decoder, unreadable or unsupported bytes, or a missing video frame |
| `unknown` `visual_too_small` | fewer than 1024 opaque pixels |
| `unknown` `visual_part_unavailable` | zero or several `primary`/`image`/`video` parts |
| `unknown` `visual_composite_unproven` | an `overlay` part changes the final pixels |
| `unknown` `palette_color_translucent` | the approved color carries alpha |

A `pass` or `fail` carries a `proof` on the check: the artifact manifest hash, the
decoded part ID, version and hash, the decoder, frames and pixels analyzed, the
tolerance, the measured coverage, the dominant swatches and the distance of the
nearest swatch. The contract rejects a pass or fail without it, a proof for another
artifact hash, and any proof on a non-deterministic result. A hard `fail` blocks the
receipt; a soft one does not. The proof says the color is present, not where it is
placed or in what usage; that stays unproven. The factual coverage check still keeps
every media receipt at `needs_review`.

## OCR literal checks (images and video, behind a switch)

Mandatory and avoid literals of an image or video are read from the final pixels by
a provider-backed vision model (Florence-2 on Replicate), never from the generation
prompt. The Admin platform setting `isBrandVisualAnalysisEnabled` is **off by
default**; while it is off no provider is called, nothing is paid, and the checks are
`unknown` (`visual_analysis_disabled`). It is the master kill switch. Each organization
also has its own **Brand vision checks** setting (`isBrandVisionChecksEnabled`, off by
default; owners and admins turn it on and pay for readings in credits). A reading runs
only when both are on, and `BrandVisualAnalysisService.isEnabled(organizationId)` is the one
place that reads them: the request path defers on it and the background job re-checks it
before every paid prediction. The platform switch overrides an organization that turned it on.

The model is an Admin-selected catalog model, not an environment variable. The
platform setting `brandVisionOcrModelKey` holds the `Model.key` of an active,
platform-owned Replicate row tagged `brand-ocr` (the seed registers
`lucataco/florence-2-large`, the default). The provider runs that row's pinned
`externalId` (`owner/name:version`) and records the row's `providerCostUsd` per second
of reported runtime. A key that is unset, unknown, inactive, untagged, not pinned to a
version or not priced per second leaves the analysis `unavailable` (fail closed); there
is no fallback model or price.

`validateBrandArtifact(input, { visualAnalysis })` takes the analysis port from its
caller; `BrandValidationReceiptService` passes `BrandVisualAnalysisService`, and the
plain validator stays free of provider, settings and billing dependencies. The model
receives PNG frames of the one final visual (the whole still, or four sampled video
frames) no wider than 1280 px, attributed to the snapshot's organization and brand.
Each prediction is recorded in the media vendor-cost ledger
(`brand-validation-ocr`), priced from the runtime Replicate reports, and a frame
already read by this process is not paid for again.

### The reading runs in a background job (cold starts)

A community model on Replicate boots cold for minutes (a live OWL-ViT prediction took
138 s from request to answer, of which 1.6 s was runtime), so no reading happens in a
request. `BrandValidationReceiptService.validateReceipt` validates the visual at once
with the readable OCR and placement checks left `unknown`
(`visual_analysis_pending`) and, when the platform switch is on, queues one job on
`brand-vision` (deduplicated by receipt). The workers' `BrandVisionProcessor` calls
`completeVisionChecks`, which reads the pixels (each prediction waits up to 5 minutes,
then is cancelled and its reported runtime priced) and revalidates the receipt:

- a proof or a forbidden literal moves the receipt to `ready`, `needs_review` or
  `blocked`, which the publication gates read live;
- a reading that cannot complete (timeout, provider error) is recorded as
  `visual_analysis_unavailable`, fails closed, and the spend is in the ledger;
- a receipt with no pending check is left alone, so a duplicate job pays nothing, and a
  job runs once (a failed job leaves the checks pending, never a second reading).

A breakout output with a pending visual is queued for a member's review until the
check finishes. Without a queue nothing is deferred and no reading is made.

Matching is the text path's exact, case-sensitive NFC/LF comparison, per frame (a
literal never joins across frames). A reader can miss text but not invent a literal,
so only presence is evidence:

| Rule | Read in a frame | Not read |
| --- | --- | --- |
| mandatory literal | `pass` | `unknown` `ocr_literal_not_found` |
| avoid literal | `fail` `forbidden_literal_present` | `unknown` `ocr_absence_unproven` |

A pass or fail is `deterministic_render` with an `ocr` proof: the artifact and part
hashes, the model identity and version, the frames, the hash of the text each frame
yielded (not the text) and the matching frames. Disabled, unavailable, an answer
with the wrong number of frames, an undecodable artifact, a composite (an `overlay`
part) or several visuals all leave the checks `unknown`. The complete-segmentation
matcher `matchBrandLiteralBlocks` is not used here: it proves factual coverage of
all visible text, which a reader that can miss text cannot establish.

## Logo and product placement (images and video, behind the same switch)

An approved `logo` or `product` asset is looked for in the final pixels with an
open-vocabulary detector (OWL-ViT on Replicate). It uses the same port, the same
off-by-default Admin setting `isBrandVisualAnalysisEnabled` and the same ledger path as
OCR (category `brand-validation-vision`, priced from the reported runtime). The detector
is the catalog row named by `brandVisionDetectModelKey` (tag `brand-detection`; the seed
registers `adirik/owlvit-base-patch32`, the default), resolved and priced like the OCR
model, and unavailable the same way when it is missing.

A detector only says something logo-like or product-like is somewhere, so it is
never trusted for identity. The validator asks for the query `logo` or `product`,
keeps regions at or above `minDetectionScore` 0.3 (at most five per frame), crops
each from the frame and compares the crop with the approved reference asset's own
bytes (the reference is hash-verified against the snapshot first) by zero-mean
normalized correlation on a 32x32 grayscale of both. A region at or above
`minSimilarity` 0.7 is a match. Missing a logo is not evidence it is absent, so
placement has no fail:

| Outcome | When |
| --- | --- |
| `pass` (`deterministic_render`) | a detected region matches the approved asset |
| `unknown` `placement_not_found` | nothing detected at or above the minimum score |
| `unknown` `placement_unmatched` | regions were detected and none matches the asset |
| `unknown` `reference_unavailable` | no hash-verified reference bytes (no call is made) |
| `unknown` `visual_analysis_disabled` / `visual_analysis_pending` / `visual_analysis_unavailable` | switch off, reading queued in the background, or provider error / timeout / an answer for the wrong number of frames |
| `unknown` `artifact_undecodable` / `visual_composite_unproven` / `visual_part_unavailable` | as for OCR |

The `placement` proof records the artifact and part hashes, the model identity and
version, the query, the approved asset and its hash, both thresholds and the
matching regions (frame, detector score, similarity, box as fractions of the frame).
The contract accepts it only on a logo or product pass. The check proves a region
resembling the approved asset exists; it does not prove size, position or that the
asset is the only mark. Redrawn or distorted logos in generated media usually stay
`unknown`, and then the receipt stays in review as it does for every media artifact.

## Fonts from a render manifest (exported stills)

Font rules are decided only from the render manifest the platform's own renderers
(visual projects, visual code) store with an export. `BrandValidationReceiptService`
reads it with `BrandRenderEvidenceService.read(scope, ingredientId, bytes)` against
the exact bytes the receipt pinned and passes the outcome to
`validateBrandArtifact(input, { renderEvidence })`; only `verified` counts. The
validator also checks the manifest's tenant, brand, artifact hash and medium against
the artifact. Every other path (a model's image, an upload, no reader) has no
manifest and stays `unknown`.

An approved font is one a rule can recognize in the manifest: an `owned_asset`
typography rule by the hash (and asset id) of the font file the renderer loaded plus
the reported family, weight and style; a `verified_runtime` rule by the family,
weight and style of a system font; a `font` asset rule by its file hash. A rule with
availability `unknown` or `unavailable` cannot be recognized.

Only a still with `complete` coverage is proven (video manifests inspect sampled
frames, so text outside them is unseen). Every text layer with visible text must be
reported by the font engine, drawn with no fallback, and drawn only with approved
fonts; otherwise every font rule is `unknown` (`font_usage_unreported`,
`font_fallback_used`, `font_not_approved`, `font_no_text_layers`,
`font_coverage_partial`, `render_evidence_missing`, `render_evidence_rejected`). A
rule then passes (`deterministic_render`, `font` proof naming the manifest id and
hash, renderer, layers inspected and matching fonts) when its own font drew at least
one layer, and is `unknown` (`font_not_used`) when it drew none. Fonts never fail
here: a fallback is evidence against the design, not that this rule applies to it.

## Persisted media receipts (breakout visuals)

Studio image and video generations keep their raw-mode generation receipt. A breakout
visual (`BreakoutVisualBrandReceiptService`, called by the visual output pipeline once
the generation is ready and before the visuals are composed) also gets its own
approved-brand receipt, keyed `<ingredientId>:brand-validation`: create, resolve (the
approved snapshot, the identity layer `not_applicable` because the brand was not applied
to the prompt), dispatch (the provider attempt id, else the ingredient id), bind (the
stored bytes) and `BrandValidationReceiptService.validateReceipt`, so the palette, font,
OCR and placement proofs are persisted with the receipt exactly as text is. It is replay
safe, spends nothing itself, and fails soft: an unreadable approved identity or
unreadable bytes leave no evidence rather than an error.

Readiness stays what the contract allows: a visual never completes factual coverage (it
is hard `unknown` at best, see the fact check), so a media receipt is `needs_review` at
best. A hard failure (for example a required palette color
absent) makes the receipt `blocked`. `readBreakoutMediaOutputRecovery`, which the
schedule-time and dispatch publication gates both read, then returns `awaiting_review`
with `quality_or_brand_blocked` for the output, which no member approval clears; the
pipeline composes the visual onto the caption draft but does not queue it for review or
score it. A missing visual receipt changes nothing, so the gate only ever tightens. The
receipt inspector shows each deterministic check's measurements.

Failures are `BadRequestException` with exactly one of:

- `brand_validation_invalid_input`: malformed metadata/material, limits or stale identities.
- `brand_validation_snapshot_hash_mismatch`: canonical snapshot digest disagreement.
- `brand_validation_artifact_hash_mismatch`: actual part/text or ordered aggregate manifest disagreement.
- `brand_validation_reference_mismatch`: supplied reference identity/hash disagreement.

Metadata is descriptor-checked before schema parsing/hashing. Byte views are
captured privately, with eight parts/references and separate 20 MiB aggregate
artifact/reference budgets. Parts are bound by exact ID/version and canonical
manifest order; all bytes are hashed, including unsupported components. Reports
never return partial validation after invalid input. Repeated direct calls may
produce different report IDs/timestamps.

The authorized caller must acquire scoped nondeleted assets, snapshot and artifact
versions, verify stored hashes, retain approval authority, and atomically persist
against unchanged identities using CAS and durable scoped idempotency. This leaf
cannot establish tenant authority from mathematically consistent self-authored
metadata. It performs no networking, retries, billing or durable storage, and calls a provider only through the optional analysis port below; a video is written to a private temporary file for `ffmpeg` and removed.

Complete feature delivery still requires trusted qualified render/font/region
proof, approved complete factual claim and asset-text authority, authenticated
material acquisition, persisted receipts/readiness, visible export reports and
recovery, and a tighten-only publication adapter. These remaining requirements
keep the parent feature open; conservative unknown is not customer-path completion.

## Isolated literal block matcher

`matchBrandLiteralBlocks(text, literals)` is an independent synchronous kernel.
It returns a fresh nonempty array of original literal positions only for a unique
complete segmentation. Equal wording at distinct positions remains distinct and
may be ambiguous; reuse of one position across successive blocks is permitted.
It supplies segmentation evidence only, never factual truth, owner approval,
compliance, or readiness. The current service does not call it and retains its
always-unknown factual coverage behavior.

The matcher applies CRLF-to-LF and NFC, then outer ECMAScript trim once per string.
Internal case, spaces and punctuation remain exact. Blocks may join only across
at least two LF with SPACE/TAB between them and following indentation. Adjacent
sentences, single LF, or ordinary spaces alone cannot form complete blocks.

Raw and normalized limits are 100000 UTF-16 units of actual text, 128 literals,
and 4000 units per literal. One inclusive 4000000-unit budget covers all
preprocessing, separator work, candidate comparisons, path updates and
reconstruction. It never returns a partial sequence. Inconclusive outcomes are
`factual_coverage_unverified`, `factual_coverage_ambiguous`,
`factual_coverage_work_limit`, or `no_visible_text`. Malformed primitive/array
input throws `TypeError('brand_validation_invalid_literal_match_input')` without
coercion or caller getter execution. Frozen ordinary arrays are supported;
proxies, custom array prototypes and malformed indexed slots are rejected.

Integration remains blocked on an authenticated immutable catalogue and source
authority, complete material scope, and a frozen factual-report rubric/cache
contract. A future canonical wrapper must preserve distinct reviewed row IDs and
persisted ordering, map returned positions to that same frozen row array, and
establish source/review authority separately. It must not deduplicate wording or
activate factual/report decisions solely from a unique array result.

## Receipt completion adapter

`BrandValidationReceiptService.validateReceipt(actor, receiptId)` first calls
`BrandedGenerationArtifactMaterialService.acquire` to authorize the receipt scope,
re-read pinned artifact bytes and verify artifact and reference hashes. For a
non-raw receipt it then calls `validateBrandArtifact` with the receipt's own
snapshot, bound artifact and acquired material. Raw receipts skip the validator
and use a null report. The adapter computes the semantic report hash, checks for
exact-scope reuse, then calls `recordValidation` with the acquired revision and
`validate` for a checking receipt or `revalidate` otherwise.

The operation key is
`brand-validation:<validate|revalidate>:<reportHash|raw>`. A receipt outside checking
reuses its report without a write only when its stored validation has the exact
same semantic hash, or both reports are null for raw mode. Acquisition and hash
verification still run before reuse. Receipt events provide deterministic
idempotency before CAS for concurrent or lost-response replays; a real revision
conflict propagates without retry.

All acquisition, access, integrity, validator and persistence errors propagate
unchanged without a receipt write, state change or partial report. In particular,
an integrity error leaves a checking receipt in checking with no invented checks.
The adapter does no provider work of its own and never retries a paid call. The one
paid step is the optional fact check below, which runs only when a
`BrandFactCheckService` is wired and bills the vendor cost ledger; with none wired the
adapter performs no provider work and preserves costs and budget.

Readiness comes only from `classifyBrandedGenerationReadinessV1` through the
existing receipt projection. Any hard failure gives blocked/failed; raw completion
gives ready/not_claimed. A text draft whose every required hard check passes,
factual coverage included, is ready/passed; with no fact check wired, or when it
cannot decide, factual coverage stays hard unknown and approved output is
needs_review/unverified.

## Fact check (`system:factual_coverage`, #6717)

`BrandFactCheckService` (`BrandFactCheckModule`, wired into
`BrandValidationReceiptModule`) decides the hard `system:factual_coverage` check. It
reaches the validator as `BrandValidationOptions.factCheck`, bound to the receipt's
actor, so `BrandValidationService` itself stays dependency-free and a caller with no
fact check gets the old always-unknown behavior.

1. **Claims.** A structured LLM call (`LlmDispatcherService.completeStructured`,
   schema-enforced with one repair retry) extracts the checkable factual claims
   (numbers, prices, dates, rankings, guarantees, named people, partners) from the
   draft text. Each claim carries a `quote` that must appear verbatim in the text, or
   the extraction is refused. Opinions, slogans and calls to action are not claims.
   For an image or video the text is whatever the OCR read of #6727 produced for the
   mandatory and avoid literals; no extra read is paid for, and a visual with no read
   text is not checked at all.
2. **Evidence, approved brand evidence only.** The facts of the receipt's approved
   Brand OS snapshot (none when the snapshot is provisional) and the brand's
   `BRAND_TRUTH` Knowledge passages retrieved per claim through
   `KnowledgeContentRetrievalService.retrieveBrandKnowledge`: pgvector, tenant scoped
   (`organizationId`, `isDeleted: false`), limited to the actor's brand plus
   organization-wide sources, current ready active versions only, and gated by
   `BrandAccessService`. There is no web search. A snapshot that is not the actor's
   own organization and brand is refused before any read or model call.
3. **Verdicts.** A second structured call judges every claim against that evidence,
   or is skipped when there is none (every claim is then unverified).
   - `supported`: the evidence states it. The verdict cites evidence ids and a quote.
   - `contradicted`: the evidence states something incompatible.
   - `unverified`: no backing evidence.

   A `supported` or `contradicted` verdict stands only with at least one citation
   that names a real evidence item and quotes it verbatim (compared after Unicode
   form, quote glyph, whitespace and case normalization). Anything else, and any
   claim the judge skipped, is `unverified`, so a model can lose a pass but never
   invent one.
4. **Result.**

   | Situation | `system:factual_coverage` |
   | --- | --- |
   | Any claim contradicted | hard `fail` (`factual_claim_contradicted`): brand blocked, not approvable as is |
   | Else any claim unverified | `unknown` (`factual_claim_unverified`): goes to review |
   | Else every claim supported, or none, in a whole standalone text draft | `pass` |
   | Else supported claims in a multipart text | `unknown` (`factual_coverage_text_incomplete`) |
   | Else supported claims in OCR text of an image or video | `unknown` (`factual_coverage_media_unproven`): a visual is never fully read, so it can never reach ready/passed |
   | The check could not run | `unknown`, with `fact_check_budget_exhausted`, `fact_check_unavailable`, `fact_check_invalid_output`, `fact_check_evidence_unavailable`, `fact_check_claim_limit`, `fact_check_text_too_long` or `fact_check_scope_mismatch` |

   The check never passes by default: a thrown error, a malformed answer, more than
   32 claims, text over 20,000 characters, an exhausted budget or a down provider all
   leave the check `unknown`. A result that would break the report contract is
   replaced by `unknown` (`fact_check_invalid_output`) instead of failing validation.
   The soft and hard results stay separate: this check only ever replaces the one
   hard system check and touches no brand rule.
5. **Proof.** A `fact` proof (`brandFactProofV1Schema`, in
   `brand-artifact-proof.contract.ts`) is attached to the check, also for `unknown`
   and for a draft with no claims (an explicit empty claim list and the evidence id
   `system:no_factual_claims`). It binds the artifact hash, the snapshot hash, the
   hash of the checked text, the sorted Knowledge source versions that supplied
   passages, the claim list with its canonical hash (`hashBrandFactClaimsV1`), the
   models that answered and whether the text was complete. The contract itself
   rejects a pass that carries an unverified claim, a partial text or a visual, and a
   fail without a contradicted claim. The receipt inspector shows it on the
   `system:factual_coverage` line next to the other proof lines
   (`brand-proof-summary.util.ts`).
6. **Cost.** Both model calls and any Knowledge embeddings go through the existing
   LLM dispatcher and context services, which record the vendor cost in the LLM
   vendor cost ledger for the actor's organization and brand. No credits are
   charged for the check itself. Each validation or revalidation runs it again.

**With the background vision job.** The request path defers the paid reading of a
visual (`visual_analysis_pending`), so no text has been read and the fact check does
not run for it yet: a text draft is fact-checked in the request path, a visual not at
all. The `brand-vision` job (`completeVisionChecks`) revalidates only receipts with
pending vision checks, so only visuals; that revalidation reads the pixels, hands the
read text to the fact check (the same `onFrameTexts` hook) and records the result with
the OCR and placement proofs in one report. A contradicted claim in a visual's read
text therefore blocks the receipt when the job finishes, exactly like a forbidden
literal, and a text receipt is never revalidated by the job, so its fact check runs
once. A job that finds nothing pending pays nothing, and neither does its fact check.

The claims are a model's reading of the draft: a claim the extractor misses is not
checked, so a pass means that no claim the extractor found lacked evidence.
Real-Postgres coverage of the Knowledge path is `brand-fact-check.postgres.spec.ts`.

The production trigger belongs to #5786: after `bindArtifact` resolves, including
a replay, its route matrix imports `BrandValidationReceiptModule` and calls
`validateReceipt(actor, receipt.id)`. This module registers no application or HTTP
caller. This service slice is partial delivery and leaves #5787 and #4617 open.
