# Library

## What exists
`/library` with typed views: `/library/assets`, `/images`, `/videos`, `/avatars`,
`/voices`, `/music`, `/gifs`, `/captions`, `/references`, `/imported`, `/recent`,
`/starred`, `/trash`, `/overview`, and `/library/shelf/...`. Imported, Generated and
Knowledge items are separate concepts (see the product-boundary memory note).

## How a user reaches it
Sidebar Library group, the Library link after a generation, or the org-scoped URL.

## How to drive it
Specs under `playwright/e2e/tests/library/`: `library-landing`, `library-images`,
`library-assets-interactions`, `library-media-interactions`, `library-search-responsive`,
`content-library`, `media-types`, `avatar-library`, `resolved-navigation`.

## What usually breaks
- Signed media URLs expire or are blocked by the network guard; mocked specs should serve
  fixture thumbnails.
- Soft delete is `isDeleted: boolean` (no `deletedAt`); Trash assertions follow that.
- Asset lists virtualize; scroll or search to bring the row into the DOM before asserting.
- Search layout changes at narrow widths (`library-search-responsive`).
