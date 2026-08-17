---
name: article-card-editorial
description: Generate and wire Genfeed public article cards in the approved dark editorial studio style. Use when creating a card for a seeded article, replacing published article artwork, or preparing OG artwork for a scheduled article.
metadata:
  version: "1.0.0"
  tags: "articles, seo, og-cards, image-generation, editorial"
---

# Article Card Editorial

Generate one article-specific image that works as both the article cover and OG card.

## Inputs

- Article label, summary, sections, and publication date from the seed catalog
- Vincent identity reference
- Authentic Genfeed G mark
- Private approved style reference: `~/.codex/artifacts/genfeed-article-cards/references/ref-0001.png`

## Sources of truth

- Published launch articles: `apps/server/api/scripts/seeds/data/launch-articles.ts`
- Scheduled SEO articles: `apps/server/api/scripts/seeds/data/seo-articles-wave-*.ts`
- Stable identity map and URL builder: `apps/server/api/scripts/seeds/data/article-artwork.ts`
- Production objects: `s3://cdn.genfeed.ai/assets/cards/articles/<artwork-id>.webp`
- Public URLs: `https://cdn.genfeed.ai/assets/cards/articles/<artwork-id>.webp`

## Asset identity

- Allocate the next unused `card-####` value in `ARTICLE_ARTWORK_IDS` before generating a new article card.
- Treat the value as permanent and never recycle it.
- A title change requires no asset change.
- A slug change moves the existing map entry to the new slug while preserving its `card-####` value.
- Keep titles, slugs, headlines, and other mutable copy out of S3 filenames.

## Card system

Keep these invariants in every generation:

- 16:9 landscape, delivered at `1280 x 720`
- Near-black charcoal editorial studio and matte floor
- One monumental physical Genfeed G prop using the authentic silhouette
- Vincent large enough to read at thumbnail size, naturally colored and recognizably himself
- Warm ivory high-contrast editorial serif headline
- Blue rim light on one side, restrained coral rim light on the other
- Real fabricated materials such as plaster, slate, steel, brass, glass, or painted timber
- No fake product UI, platform logos, generic AI imagery, paper props, ribbons, small copy, or watermark

## Article-to-visual process

1. Read the article label, summary, metrics, mistakes, and primary sections.
2. Reduce the article to one visual thesis, not a list of features.
3. Write a two-to-four-word thumbnail headline that complements the SEO title.
4. Remove terminal punctuation. Do not add a period after the headline.
5. Translate the thesis into one physical studio interaction:
   - clarity -> alignment or focus mechanism
   - formats -> lens, aperture, or speaker installation
   - reusable briefs -> rigid modular tiles
   - distribution -> physical routing or motion mechanism
   - retention -> timer, brake, or hold mechanism
   - repurposing -> one source transformed into several physical formats
6. Choose a distinct facial expression and action that reinforce the thesis.
7. Generate with the built-in ImageGen tool, attaching all three image references.
8. Reject the result if the metaphor does not match the article, the Genfeed mark drifts, Vincent is too small, the headline gains punctuation, or the result looks like generic CGI.

## Prompt skeleton

```text
Use case: ads-marketing
Asset type: 1280 x 720 article thumbnail and OG card
Article: <full seeded article label>
Primary request: Create a new card in the approved Genfeed dark editorial studio direction.
Input images: Image 1 is the approved style reference; Image 2 is Vincent's identity reference; Image 3 is the authentic Genfeed G mark.
Scene/backdrop: near-black charcoal cyclorama and matte floor.
Subject: one monumental solid Genfeed G installation expressing <article thesis>; Vincent is large and physically interacting with it using <pose/expression>.
Style/medium: real high-end editorial studio photography of a fabricated physical installation.
Lighting/mood: warm key on Vincent, blue rim on one G edge, restrained coral rim on the other.
Text (verbatim): "<TWO TO FOUR WORD HEADLINE>"
Typography: enormous warm-ivory high-contrast editorial serif, exactly once; no punctuation, subtitle, or small text.
Constraints: preserve Vincent's identity; exact authentic G silhouette; solid physical materials; no fake UI, paper, platform logos, duplicate person, or watermark.
```

## Asset delivery

1. Keep the original generated PNG under `~/.codex/artifacts/genfeed-article-cards/<artwork-id>/` for traceability.
2. Resize and crop to exactly `1280 x 720`.
3. Convert to WebP with a visually lossless/high-quality setting.
4. Upload to `s3://cdn.genfeed.ai/assets/cards/articles/<artwork-id>.webp` with `Content-Type: image/webp`, server-side encryption, and `Cache-Control: public, max-age=31536000, immutable`.
5. When replacing an existing WebP key, invalidate that exact CloudFront path before visual verification.
6. Confirm the article slug resolves to its permanent id through `articleArtwork('<slug>')`.
7. Verify the public URL returns HTTP 200, `image/webp`, and the uploaded byte length.
8. Inspect the public CDN image directly. Keep CDN binaries out of application `public/` folders.

## Verification

- Every published/scheduled article in scope has a matching S3 WebP object and public CDN URL.
- Every image is `1280 x 720`, WebP, and visually legible at card size.
- The headline has no terminal punctuation or small copy.
- The illustration metaphor is traceable to the actual article content.
- The Genfeed mark and Vincent identity references were attached to generation.
