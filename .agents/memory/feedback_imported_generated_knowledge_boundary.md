---
name: Imported sources, generated outputs and brand Knowledge
description: Posts saved for remix are imported sources; brand Knowledge is separate context and generated posts are separate outputs
type: feedback
status: active
last_verified: 2026-09-24
topics: [extension, imports, posts, remix, concepts, knowledge, provenance]
---

**Rule:** Importing an external post for remix creates or reuses an Imported source. Knowledge is brand context. Generation creates a separate Generated output linked to its source and concept/run. Preserve the original source, URL, author and content. Use clear Imported and Generated labels and appropriate actions throughout the journey; manually authored content keeps its own truthful provenance.

**Why:** On 2026-09-24 Vincent explicitly corrected the conflation of saved post ideas with brand Knowledge. The implementation described by historical #4130 redirected Ideas into Knowledge, but that implementation is not the intended product boundary. Finding code does not establish that it satisfies the product requirement.

**How to apply:**

- Target journey: open a social post or paste its URL → Import post → Imported source → editable saved concept → original generation → separate Generated output in Library/Review.
- Reuse existing social-post import, source persistence and canonical remix contracts. Avoid a parallel Ideas database or a second generation lifecycle.
- Save/import alone starts no generation or publishing. Show source availability and failure honestly.
- Add to brand Knowledge is a separate explicit action. Imported inspiration must not silently become authoritative brand context.
- Preserve existing Knowledge and legacy saved ideas. Any reassignment requires a prepared, explicit and recoverable transition; do not infer intent from the Inspiration purpose alone or bulk-convert existing entries.
- Show imported sources with source inspection/Remix actions; show generated outputs with their own review/edit/publish lifecycle and source lineage.
- Verify source code, wiring, persisted behavior, visual acceptance and deployment separately. Existing generic remix UI does not prove the complete concept-to-original-ad journey.

This user correction supersedes the broad capture-to-Knowledge requirement in #4130 and the former wording of #4340. It does not erase their historical delivery evidence.

Canonical ownership: [#5108 import correction](https://github.com/genfeedai/genfeed.ai/issues/5108), [#4340 extension epic](https://github.com/genfeedai/genfeed.ai/issues/4340), [#4069 original-ad journey](https://github.com/genfeedai/genfeed.ai/issues/4069). See the [feature map](reference_product_feature_map.md) for dated evidence; GitHub owns live work status.
