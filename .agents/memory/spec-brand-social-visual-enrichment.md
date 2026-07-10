---
name: Brand and social visual enrichment
description: Automatically import website headers and connected-account avatars into stable Genfeed-owned media.
type: project
status: active
last_verified: 2026-07-10
topics: [brands, onboarding, oauth, assets, s3, ui]
---

# Brand and Social Visual Enrichment Spec

**Why:** Brands and connected channels need stable, recognizable visuals without depending on mutable third-party hotlinks.
**How to apply:** Import website headers and provider PFPs through Genfeed-owned storage, preserve manual brand assets, and keep media failures non-blocking.

## Purpose

Make a newly configured brand visually recognizable without manual asset work: a saved website supplies the brand header, while a connected social account supplies its profile photo and identity label.

## Non-Goals

- Replacing an existing user-uploaded brand logo or banner.
- Making currently incomplete OAuth providers connectable.
- Periodically refreshing remote images outside an explicit website scan or account reconnect.
- Treating provider-hosted URLs as durable application state.

## Interfaces

- `POST /brands/:id/scrape` imports the discovered website banner candidate into a brand-owned `BANNER` asset when the brand has no banner.
- Credential OAuth verification persists `externalName`, `externalHandle`, and an S3-backed `externalAvatar` when the provider exposes them.
- `PATCH /credentials/:credentialId` accepts provider identity data for selection flows such as Instagram, but the server imports the submitted avatar URL before persistence.
- Serialized credentials expose `externalName` and `externalAvatar` to trusted application clients.
- Brand connected-account views render the profile photo with a small platform-icon badge and fall back to identity initials/platform icon.

## Key Decisions

- Remote images are copied into the existing files-service/S3 pipeline.
- Website banner precedence remains hero/banner DOM image, then `og:image`, then `twitter:image`/first discovered image.
- Automatic website enrichment uses `replaceExisting: false`.
- Social avatar imports use a deterministic key per credential so reconnects refresh the object without accumulating rows.
- Avatar import failures do not fail OAuth; the connected account remains usable with a fallback illustration.
- External URL imports reject private-network destinations before the files service fetches them.

## Edge Cases and Failure Modes

- A website with no usable image still completes brand setup without a banner.
- Unsupported image extensions or private URLs are skipped without overwriting existing assets.
- An existing brand banner is preserved.
- A provider with no avatar still persists its name and handle.
- S3/files-service failure leaves the previous S3 avatar untouched and does not disconnect the account.
- Missing or broken avatar images render deterministic initials and the platform badge.
- Every credential read/update remains organization-scoped and soft-delete guarded.

## Acceptance Criteria

- WHEN a website scrape finds a valid banner candidate and the brand has no banner, THE SYSTEM SHALL import it as a brand-owned S3-backed banner asset.
- WHEN a brand already has a banner, THE SYSTEM SHALL preserve it during automatic website enrichment.
- WHEN a supported OAuth provider returns a profile photo, THE SYSTEM SHALL copy it to S3 and persist the copied URL as `externalAvatar`.
- IF avatar import fails, THE SYSTEM SHALL keep the account connected and preserve any previous avatar.
- WHEN credentials are serialized, THE SYSTEM SHALL expose `externalName` and `externalAvatar` without exposing credential secrets.
- WHEN connected accounts are displayed, THE SYSTEM SHALL show a circular PFP or fallback with a platform-icon badge.
- WHEN multiple accounts for the same platform are connected, THE SYSTEM SHALL render each credential independently.

## Test Plan

- Brand setup service tests for import, no candidate, existing-banner preservation, and non-blocking failure.
- Credential service tests for S3 import, private URL rejection, previous-avatar preservation, and profile-only updates.
- Provider callback tests for Twitter, TikTok, YouTube, Instagram selection, Facebook, LinkedIn, Reddit, and Threads profile mapping where fixtures already exist.
- Serializer attribute tests for public identity fields and secret exclusion.
- Brand social-card tests for PFP, fallback, platform badge, multiple accounts, and non-link rows.
