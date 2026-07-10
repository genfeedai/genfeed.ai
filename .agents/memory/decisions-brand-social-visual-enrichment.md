---
name: Brand and social visual enrichment decisions
description: Storage and overwrite-policy decisions for automatic brand headers and connected-account avatars.
type: project
status: active
last_verified: 2026-07-10
topics: [brands, oauth, assets, s3]
---

# Brand and Social Visual Enrichment Decisions

**Why:** Website and provider image URLs are not a durable ownership boundary.
**How to apply:** Use the existing files-service/S3 path for all automatic visual enrichment and never replace user-selected brand visuals implicitly.

## Decision: own both image classes in S3

Provider and website hotlinks are mutable, may expire, may block referrers, and leak client requests to third parties. Both brand headers and account PFPs are therefore copied through the files service into Genfeed-owned S3/CDN storage.

## Decision: reuse existing import mechanisms

Website headers use the existing guarded Brand Kit asset importer so they become normal brand assets with the same serializer and cache behavior as uploaded/generated banners. Social avatars use the same files-service upload boundary with a credential-scoped deterministic object key; they do not become library ingredients.

## Decision: enrichment is additive

Automatic enrichment fills missing brand visuals and refreshes the avatar for the same connected credential. It never replaces a user-selected brand banner or logo. OAuth success is independent from media-import success.

## Rejected approaches

- **Hotlink everything:** quickest, but unreliable and inconsistent with the brand asset model.
- **S3 for headers only:** leaves the connected-account UI dependent on provider URL lifetimes.
- **Create Asset rows for social PFPs:** adds library-visible assets and lifecycle complexity for what is credential metadata, not reusable creative media.
