---
name: generation + harness world-class audit
description: Map of image/video/ads generation vs content harness; gaps to best-in-class brand-native media
type: project
status: active
last_verified: 2026-08-12
implementation_note: >
  Media/ads harness wiring + profile seed + winner promotion landed on qa/260812
  (2026-08-12). Winner API: POST /harness-profiles/promote-winners. Video
  upscale/reframe credits use CreditsInterceptor only. Private pack examples
  still need real copy (human #2837). No separate vector DB/RAG product yet —
  pgvector ContextEntry exists but is not the taste path.
topics: [harness, generation, image, video, ads, quality, private-packs]
---

# Generation + harness audit (image / video / ads)

**Date:** 2026-08-12  
**Scope:** monorepo `genfeed.ai` + private repo `genfeedai/harness`  
**Goal:** make brand-native image, video, and ads generation best-in-class — not generic model wrappers.

## Short answer

**Yes — `genfeedai/harness` (private packs) is required for world-class taste.**  
The monorepo already has the OSS harness **contracts + registry + compose path**. The private repo is where **real brand taste** is supposed to live. Today that private pack is a **scaffold** (TODOs for examples). **Harness is wired primarily into text generation, not into image/video/ads media pipelines.** Closing that gap is the product path to “best in the world,” not more model keys alone.

## What exists today (evidence)

### A. Two harness layers

| Layer | Location | Role |
| --- | --- | --- |
| **OSS contracts** | `packages/harness` (`@genfeedai/harness`) | Types, `ContentHarnessRegistry`, `composeContentHarnessBrief`, `CORE_CONTENT_HARNESS_PACK` |
| **Runtime loader** | `apps/server/api/src/services/harness/` | Loads core + brand-fidelity + `CONTENT_HARNESS_PACKAGES` external packs |
| **Brand profile UI/API** | settings `/harness`, `HarnessProfilesModule` | Operator-editable voice/thesis/examples per brand |
| **Brand-fidelity pack** | `packages/harness` (`BRAND_FIDELITY_HARNESS_PACK`) | Generic brand fidelity guardrails, built in |
| **Private packs** | `github.com/genfeedai/harness` → `@genfeedai/private-harness` | Vincent / genfeed / shipshit / shipshitshow packs |

Private pack env contract (from private README):

```bash
CONTENT_HARNESS_PACKAGES=@genfeedai/private-harness
```

### B. Where harness actually runs in generation

| Path | Harness? | Notes |
| --- | --- | --- |
| **Content intelligence** (`content-generator.service`) | **Yes** | `buildHarnessSystemPrompt` → compose brief → system prompt |
| **Articles** (`articles-content.service`, review) | **Yes** | Brief + evaluation for article gen/review |
| **Agent batch captions** | Indirect | Batch uses content-generator → inherits text harness when brand present |
| **Agent `generateImage` / `generateVideo` / voice** | **No** | Media tools do not call `ContentHarnessService` |
| **Prompt bar enhance** | **No** | Generic enhancement; not pack/profile-aware |
| **Replicate / fal / ComfyUI / LoRA** | **No** | Model plumbing + LoRA storage; no harness brief → prompt builder |
| **Ads research `generateAdPack` / remix workflow** | **No** | Builds pack from connected ad + brandName/industry/objective metadata only |
| **Content quality scorer** | **Partial** | Generic image/video/text rubrics; **does not inject** harness `evaluationCriteria` |

### C. Harness content kinds today

`ContentKind` = `article | email | newsletter | post | reply | script | thread | video-script`.  

**Missing for world-class media:** `image`, `video`, `ad-creative`, `ugc`, `story`, `reel`, `carousel-visual`, `thumbnail`.  
`video-script` is copy for video, not visual generation.

### D. Private harness quality (critical)

Repo: private sibling `genfeedai/harness` package name `@genfeedai/private-harness`.

- Packs exist: `vincent`, `genfeed`, `shipshit`, `shipshitshow`.
- Shared operator/podcast cadence helpers are real and useful.
- **Examples are stubs:** e.g. Vincent pack has `examples: ['TODO: add Vincent posts that feel exactly right']`.
- Matching is **`brandName` string equality** only — brittle vs brand slug/id.
- No visual sources (reference images, palette, product shots, face/LoRA ids).
- No ads-specific anti-examples (compliance, claim risk, creative that looks like spam).

Without filled examples + anti-examples, private harness cannot beat a good generic system prompt.

### E. Media stack strength (orthogonal to harness)

These are **real production assets** and should stay:

- Image/video microservices (`apps/server/images`, `videos`), ComfyUI LoRA train/upload/list
- Replicate fail-closed webhooks + trust re-fetch (launch closeout)
- fal + other providers
- Prompt bar model selection / pricing
- Content quality scorer (generic)
- Ads research → remix workflow draft + human review gate
- Batch generation credit reserve/settle (launch closeout)

**World-class = media plumbing × brand harness, not either alone.**

## Gap analysis (ranked by impact on “best in the world”)

### P0 — product truth

1. **Private harness is empty of taste.** Fill examples/anti-examples/banned phrases per brand from real posts. Without this, every host rewrites generic voice.
2. **Harness does not touch image/video prompts.** Operator brand settings + private packs never reach Replicate/fal/ComfyUI/agent media tools.
3. **Ads path ignores harness.** Ad pack remix is platform-ad + free-text brandName; no voice/structure/evaluation from packs or profiles.
4. **Quality loop is generic.** Scorer does not use harness `evaluationCriteria` or brand examples; cannot reject “pretty but off-brand.”

### P1 — architecture

5. **Content kinds stop at text.** Extend harness intent for visual modalities (aspect ratio, motion, product/persona consistency, negative style).
6. **Brand match is weak.** Prefer `brandId` / slug / handle map over `brandName` string.
7. **Deploy wiring unclear.** Confirm prod/staging sets `CONTENT_HARNESS_PACKAGES` and can resolve `@genfeedai/private-harness` (private npm or path). Silent fail = core pack only.
8. **Prompt enhancement dual path.** Prompt-bar enhance and harness compose should share one brief composition entry for brand-scoped jobs.

### P2 — excellence layer

9. **Visual identity pack fields:** palette, type treatment, logo safe zones, product SKUs, approved faces, LoRA ids per brand, negative prompts, platform crop templates.
10. **Winner feedback into harness.** Top-performer / campaign-winner extraction should write `performance_winner` sources into packs or profile metadata (today winners feed text context, not pack registry).
11. **Ads-specific pack capabilities:** offer ladder, claim language, UGC vs studio, competitor “do not look like,” platform ad policy notes.
12. **Eval harness CI.** Hermetic tests that golden-prompt a brand pack and assert directives/examples appear; private examples stay out of public monorepo (test with fixtures).

## Target architecture (north star)

```
Brand profile (DB) + Private packs (genfeedai/harness) + core/brand-fidelity packs
        │
        ▼
 ContentHarnessService.composeBrief(intent: text | image | video | ad)
        │
        ├─► Text generators (posts, articles, batch captions)     [exists]
        ├─► Image/video prompt builders (agent + prompt-bar + fleet) [missing]
        ├─► Ads pack / remix workflow system prompts               [missing]
        └─► Quality scorer evaluationCriteria injection            [missing]
```

**Private repo stays private.** Public monorepo keeps only contracts + core pack + loader. Taste never ships in the open-source tree.

## What “best in the world” means here (measurable)

Not “more models.” Operators should observe:

| Signal | Measurement |
| --- | --- |
| Brand fidelity | Blind rate: output recognized as brand vs generic AI |
| Visual consistency | Same product/persona across 10 gens (LoRA + refs + negatives) |
| Ads usefulness | Human review reject rate on remix packs |
| Quality loop | Scorer score correlates with human accept; harness criteria appear in scorer input |
| Multi-agent | Claude/Codex/Grok load this audit + fill packs without re-asking “what is harness?” |

## Recommended workstream (do not start all at once)

### Phase 0 — data (private harness repo)

- Replace TODOs with 15–25 on-brand + 8–12 off-brand examples per pack.
- Banned phrases, handles, commercial offer, topics already partially present — harden.
- Match brands by id/slug map in pack metadata (coordinate monorepo loader if needed).

### Phase 1 — wire text fully (monorepo)

- Verify `CONTENT_HARNESS_PACKAGES` in cloud deploy env.
- Fail loud in logs when private pack fails to load in cloud.
- Agent tools that generate **copy** always pass brandId → harness brief.

### Phase 2 — visual harness (monorepo)

- Extend `ContentKind` / intent for image & video.
- Single `buildMediaPromptFromHarness(brief, modality)` used by agent media tools + prompt-bar enhance (when brand scoped).
- Attach brand LoRA / reference images from brand assets when present.
- Inject harness evaluationCriteria into content quality scorer for brand jobs.

### Phase 3 — ads (monorepo)

- `generateAdPack` / remix workflow system prompts call harness with objective `conversion` and content kind ad-creative.
- Store source-ad angles as `performance_winner` sources for the brand.

### Phase 4 — process

- This file is the shared map for any agent or contributor on the monorepo.
- Private example collection is human/operator work in `genfeedai/harness`; monorepo agents do not invent taste.
- TDD: hermetic tests for brief composition and “media path calls composeBrief” contracts (public fixtures only).
- Personal multi-host fleet notes stay in gitignored `.agents/memory/local/` / global user memory.

## Explicit non-goals

- Moving private examples into public monorepo.
- Starting GPU fleet for eval without Vincent ask.
- Replacing Replicate/fal/ComfyUI plumbing — harness **feeds** them.

## Relation to launch closeout (`qa/260812`)

Launch blockers (webhook trust, batch credits, claims) are **reliability**.  
This audit is **quality differentiation**. Both are required for sellable production; do not confuse merge of #2820 with “generation is world-class.”

## Open confirmations (ops)

1. Is `CONTENT_HARNESS_PACKAGES=@genfeedai/private-harness` set in staging/production?
2. How is private package published/resolved in cloud images (private registry vs monorepo path)?
3. Priority brand for first full visual pack: Vincent vs genfeed.ai vs shipshit?
