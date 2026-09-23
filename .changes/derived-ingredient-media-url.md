packages: @genfeedai/libs

Ingredient media URLs are now derived, never stored. The `ingredients.cdnUrl`
column is dropped; a migration first moves each value to where its kind
belongs (our objects become the `s3Key` object key, external links move to
`metadata.result`).

- `@libs/media/media-url.util` — shared, pure media URL builders:
  `resolveIngredientMediaUrl`, `buildMediaUrl`, `signCdnUrl`,
  `ingredientMediaUrl`, `readIngredientMediaUrl` and
  `assertMediaUrlSigningConfig`. Moved from the api-only
  `ingredient-media-url.util`, which is removed.
- `@libs/prisma/media-url.extension` — a Prisma result extension that computes
  `Ingredient.cdnUrl` from the row's own `s3Key` on every read (top-level,
  nested `include`, and `select: { cdnUrl: true }`), signed when a key pair is
  configured, and strips `cdnUrl` from ingredient writes so it stays read-only.
- `ConfigService.mediaUrlConfig` — CDN origin plus signing inputs for the
  builders. `PrismaService` refuses to start when a key pair is configured but
  cannot sign.

Consumers that wrote `cdnUrl` must write `s3Key` instead; reads are unchanged.
