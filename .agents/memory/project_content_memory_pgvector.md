---
name: content memory pgvector day-one
description: Postgres pgvector is the vector store for brand content memory; no separate vector product
type: project
status: active
last_verified: 2026-08-12
topics: [harness, pgvector, content-memory, generation, context]
---

# Content memory — day-one setup (Postgres pgvector)

## Decision

**No separate vector product.** The monorepo’s vector store for brand content memory is **Postgres + pgvector** on `context_entries.embedding` (1024-d, HNSW cosine index). That is the correct scale path for Genfeed SaaS tenants.

“RAG” is not a product to buy — it is **retrieve similar brand memory → inject into harness brief**. We already do that shape; we finish it properly instead of bolting on Pinecone/Qdrant.

## Layers (best content context)

| Layer | Store | When injected |
| --- | --- | --- |
| **1. Identity / taste** | Harness profile in DB (`profiles`, examples good/avoid) | Always for brand-scoped gen |
| **2. Pack defaults** | Core / EE / private harness packs | Always via `composeBrief` |
| **3. Content memory** | `context_bases` + `context_entries` + **pgvector** | When topic/query present (similar winners/library) |
| **4. Live winners (SQL)** | `contentPerformance` → top-performer prompt; X uses algo-weighted public metrics | Text gen paths that call it; promote-winners |
| **5. Brand memory narrative** | `brand_memories` | Agent assembly when enabled |
| **6. Platform pack (X)** | `platform-x` from open-source For You signals | When `intent.platform` is twitter/x |

## Schema / infra (already shipped)

- Extension: `vector`
- Column: `context_entries.embedding vector(1024)`
- Index: `context_entries_embedding_hnsw_idx` (HNSW, cosine, partial on non-null)
- Constant: `CONTEXT_EMBEDDING_DIMENSION = 1024`
- Embed provider: Replicate via `RouterService` embedding model

## Code entry points

| Concern | API |
| --- | --- |
| Compose gen brief | `HarnessGenerationService.resolveBrief` (profile + optional memory) |
| Media prompt fold | `buildMediaPromptFromHarness` / `applyToMediaPrompt` |
| Brand ANN retrieve | `ContextsService.retrieveBrandContentMemory` |
| Promote winners + embed | `POST /harness-profiles/promote-winners` → `HarnessWinnerPromotionService` |
| Seed profiles | `scripts/seeds/harness-profiles-from-packs.seed.ts` |

## Operator path

1. Fill examples (#2837) + seed profiles.  
2. Generate content with `brandId` + topic.  
3. Periodically `POST /harness-profiles/promote-winners` so winners are embedded.  
4. Retrieval automatically folds similar winners into the brief when topic is set.

## What we deliberately do **not** do

- Separate managed vector SaaS as source of truth  
- Naive whole-corpus “chat with PDF” RAG as the brand voice path  
- Always-on ANN without a topic (expensive and noisy)  
- Fine-tuning a foundation model every week for voice (few-shot + winners first)

## Scale notes

- Tenant isolation: always filter `organizationId` (+ brand-scoped bases).  
- HNSW is the production index; rebuild missing embeddings lazily on retrieve.  
- If volume explodes later, **still** prefer Postgres partition / read replicas before a second vector product.
