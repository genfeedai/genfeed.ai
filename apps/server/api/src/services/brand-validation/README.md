# Brand artifact validation core

This internal API leaf binds captured artifact bytes to canonical snapshot and
artifact metadata. It does not register a caller or persist readiness. The
synthetic corpus is regression input, never provider qualification or production
improvement evidence.

`BrandValidationService.preflightBrandCapabilities(input)` returns validator
capability admission and actionable diagnostics before generation. It does not
verify provider/model availability, quote a request, or dispatch work.
`validateBrandArtifact(input)` returns a canonical report asynchronously; capture,
hashing and conservative evaluation complete synchronously before its promise is
returned. The module exports the dependency-free service without application
registration.

| Input or rule | Current behavior |
| --- | --- |
| Complete standalone text, nonempty mandatory/avoid literal | NFC and CRLF matching; exact case-sensitive substring pass/fail |
| Semantic or empty literal | Unknown with explicit capability reason |
| Multipart text or image/video text | Unknown text coverage |
| Facts and complete factual coverage | Always unknown |
| Palette/font/logo/product/other visual asset | Unsupported without qualified artifact-bound evidence |
| Owner-excluded medium | Not applicable; absent applicability is universal |

Every report includes hard `system:factual_coverage` unknown and `quality: null`.
No reference byte hash proves asset placement, actual font use or visual
compliance. Required unavailable capabilities block preflight; optional ones warn.
Image/video admission is blocked. Unsupported reasons are
`fact_grounding_unavailable`, `semantic_validation_unavailable`,
`empty_literal_rule`, `text_coverage_incomplete`, `exact_palette_unavailable`,
`exact_font_unavailable`, `exact_logo_unavailable`, `exact_product_unavailable`
and `exact_asset_unavailable`. Reports also disclose
`factual_coverage_unverified`, `artifact_media_unsupported`, and required literal
failures through `brand_rule_failed`.

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
metadata. It performs no networking, provider calls, retries, billing or storage.

Complete feature delivery still requires trusted qualified render/font/region
proof, approved complete factual claim and asset-text authority, authenticated
material acquisition, persisted receipts/readiness, visible export reports and
recovery, and a tighten-only publication adapter. These remaining requirements
keep the parent feature open; conservative unknown is not customer-path completion.
