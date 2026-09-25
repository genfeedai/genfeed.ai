---
name: brand_voice_own_posts
description: Brand voice drafting learns how the brand writes from its own imported/published/pasted posts, with deterministic stylometric rules and verbatim exemplars
type: project
status: active
last_verified: 2026-09-25
topics: [brand, voice, agent, imports, stylometrics]
---

**Rule:** Brand voice drafting (Brand settings → Brand voice → Generate,
`POST /v1/brands/:id/agent-config/generate-voice` → `BrandGenerationService.generateBrandVoice`, and the
agent's `draft_brand_voice_profile`) builds a corpus of the brand's **own**
writing with `BrandVoiceCorpusService`:
- own-account `SourcePost` rows of the same brand (sources with
  `sourceType = OWN_ACCOUNT`, fed by Brand settings → Integrations → Imports
  "Import existing posts"); reposts, quote posts, `RT @` copies, and other
  authors are excluded; replies are classified separately;
- posts Genfeed published for the brand (weighted 0.85, quote posts excluded);
- pasted samples (DTO `samples`, max 50 × 3000 chars; always kept, verbatim).

Selection caps at 150 samples, balancing replies and originals by recency and
engagement. Website/brand fields describe *what the brand does*; the corpus
decides *how it writes*. Stylometrics (`brand-voice-stylometrics.util.ts`) are
pure and deterministic; `deriveVoiceWritingRules` emits rules only from ≥ 10
samples. Exemplars are resolved back to stored corpus text (model text is
discarded); fallback picks median-length samples. Under 10 samples the result
carries `corpus.guidance` (thin/empty corpus warning) shown on the page and the
chat card.

The brand path id is authoritative for the corpus scope
(`brands-agent-config.controller.ts` always sets `brandId = id`). Without a brand
only pasted samples are used; stored posts are never read across brands.

Approving a draft in chat (`saveBrandVoiceProfile`) writes only non-empty
fields (`buildApprovedProfilePatch`), because `updateAgentConfig` overwrites
every defined key — sending empty lists would wipe UI-edited values.

**Why:** A website describes what a brand does, not how its people write.
Drafting from real posts, with measured habits and verbatim exemplars, keeps the
voice from being smoothed into polished marketing copy.

**How to apply:** Keep new voice evidence inside the corpus service/utils; never
let the model author exemplars or samples. Public docs:
`apps/docs/content/cloud/brands.mdx` ("Brand voice from your own posts").
