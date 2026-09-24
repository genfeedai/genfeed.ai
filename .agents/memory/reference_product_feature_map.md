---
name: Product feature map and import-to-remix evidence
description: Feature entry points plus a dated implementation and acceptance inventory for post import, extension capture, concepts and original ads
type: reference
last_verified: 2026-09-24
topics: [features, extension, imports, discovery, remix, concepts, knowledge, verification]
---

# Product feature map

Use this map before claiming a feature is missing or proposing another UI. This is documentation and a dated evidence index, not a local backlog. GitHub issues own live scope, status and acceptance; an open PR, closed issue or source file alone does not prove deployed end-to-end behavior.

## Product-wide entry points

The broad feature list exists in [Capabilities](../../apps/docs/content/features.mdx) and [Advanced surfaces](../../apps/docs/content/advanced/features.mdx): web/API and workers; text/image/video/voice generation; brand context and content Library; workflows and local/BYOK execution; publishing and analytics; agent/MCP; desktop, mobile, browser and IDE clients. Those pages describe capability/distribution boundaries, not a complete implementation acceptance matrix. This audit did not verify all product features.

The [memory catalog](reference_memory_catalog.md) indexes feature specifications, including [prefilled Remix](spec-prefilled-brand-remix-runs.md), [source variations](spec-source-post-variations.md) and [agent features](features/agent/README.md). These are partial feature documents; consult current code and GitHub before using historical specs as proof of delivery.

## Settled product model

Read [Imported / Generated / Knowledge](feedback_imported_generated_knowledge_boundary.md). Knowledge is brand context. Imported posts are sources saved for remix. Generated posts are separate original outputs linked to their sources. The desired journey is:

`post URL / extension → Import post → Imported source → editable saved concept → original generation → Generated output → Library/Review`

Concept must have a verified canonical persistence/handoff contract; the presence of generic script or remix UI is not sufficient evidence. Reuse the existing run model where it satisfies that contract.

## Evidence snapshot — 2026-09-24

Inspected source paths against master `5638a43af3`; the capture/import surfaces match the previously inspected `a68dcd0c8c` baseline. No new browser smoke, provider generation or deployment acceptance was performed in this documentation audit.

| Feature | Evidence and implementation finding | Remaining acceptance / canonical owner |
| --- | --- | --- |
| Paste a social-post URL and import exactly that post | Implemented source path: FollowSourceModal calls SocialSourcesService.importPost → social-sources import-post endpoint → SourcePost. Historical #2660 is closed. | Current supported-platform and real-browser parity need fresh proof under #5108. |
| Persist external post provenance separately | SourcePost stores platform/external ID, original URL, author, content, media, collection time and tenant/brand scope. | Consistent Imported labels/actions versus Generated outputs are tracked in #5108; do not infer that all lists already expose them. |
| Extension capture UI | KnowledgeCapturePage exists; IdeasPage and IdeaDraftPage alias it. Context menu and side panel are wired. Captures POST knowledge-sources and legacy saved_ideas can be imported there. | Existing behavior conflicts with post-for-remix intent. Correct routing under #5108 while preserving explicit brand Knowledge capture. |
| Direct button on a social post | createSaveButton exists with tests, but production code has no caller; content.ts injects a generation/reply dropdown. | Post-import button wiring and its real-browser usability are missing under #5108. A helper is not a shipped interaction. |
| Main-app brand Knowledge | Settings → Knowledge supports URL/text and other source types; the old library route redirects there. | Keep as explicit brand-context flow; never use it as the default post-import destination. |
| Generic extension remix | RemixPage generates a script from supplied content and can save a draft. URL alone does not satisfy its required content input. | This does not prove import-to-concept-to-original-ad completion. #5108 / #4069 own the connected journey. |
| Source-post variations | Existing source-variation API/UI contracts and lineage; historical #2662 closed. | Reuse, then verify corrected import handoff. It is not the complete multi-scene ad pipeline. |
| Discovery/source → Remix/Studio | Existing prefilled-run UI and source selectors from #3338; #5087 tracks visual-ad discovery handoff. | Verify saved-source reuse and eligibility. Presence of cards/run UI is not complete ad acceptance. |
| Editable saved concept between import and generation | Existing editable briefs/runs provide a foundation; standalone concept persistence and full handoff have not been established by this audit. | Contract preparation and end-to-end proof remain under #4069, with import entrypoints in #5108. Do not claim no concept UI or complete delivery without tracing it. |
| Destination account/persona and source-media guards | Scoped foundation PR #5097 is open at a2b32a63ad3b32b10282c1dfe86daf25e8282ae6. | Not merged/deployed as of audit; does not complete #4069. |
| Original multi-scene ad generation | #4069 specifies scene analysis, editable storyboard, original scene generation, saved avatar/voice/product identity, alignment/captions, assembly, per-scene repair and credits. | Full integrated implementation and actual generated-media visual acceptance remain outstanding; component primitives alone are insufficient. |
| Saved research/ad browsing | #5091 governs collection and shared research; master includes saved-ad GET correction PR #5103. | Broader paid research/governance and ingestion acceptance remain with #5091/#4118, independently of generation. |
| Full browser-extension surface | #4340 remains open. #4341 and historical #4130 closed; #4342 replies, #4343 rewrite/proofread, #4344 native composer recording, #4345 attribution, #4346 local bridge and #4347 E2E remain open at audit. | #5108 adds the corrected import boundary. An implemented capture panel does not establish that the full extension is complete. |
| Complete import → concept → original ad → review | Existing pieces above do not constitute verified full delivery. | #4347 / #5108 / #4069 require browser, persistence, lineage, generated-media and deployment evidence. |

## Code evidence entry points

Paths are relative to repository root:

- `packages/pages/trends/following/FollowSourceModal.tsx`
- `packages/services/social/social-sources.service.ts`
- `apps/server/api/src/collections/social-sources/controllers/social-sources.controller.ts`
- `packages/prisma/prisma/schema.prisma` (`SourcePost`)
- `apps/extensions/browser/app/src/components/pages/{IdeasPage,IdeaDraftPage,KnowledgeCapturePage,RemixPage}.tsx`
- `apps/extensions/browser/app/src/{background,content}.ts`
- `apps/extensions/browser/app/src/platforms/ui-helpers.ts`
- `apps/extensions/browser/app/src/services/knowledge-capture.service.ts`
- `apps/app/app/(protected)/[orgSlug]/[brandSlug]/settings/knowledge/`
- `packages/pages/studio/generate/components/StudioRemixRunPanel.tsx`
- `apps/server/api/src/collections/posts/services/post-variation.service.ts`

## Maintenance

Update this dated evidence when a relevant PR merges or acceptance is recorded. Link actual GitHub evidence and distinguish source-present, correctly wired, tested, visually accepted and deployed. Do not create new local task lists or duplicate epics; use #4340 for extension, #5108 for import separation, #4069 for original-ad generation, and #5091 for paid research governance.
