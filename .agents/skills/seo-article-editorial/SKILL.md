---
name: seo-article-editorial
description: Write, schedule, and wire a Genfeed SEO article from a researched search intent. Use for new public articles, article seed briefs, two-per-week publishing plans, and revisions to scheduled SEO content.
metadata:
  version: "1.0.0"
  tags: "articles, seo, editorial, seeds, scheduling"
---

# SEO Article Editorial

Produce a source-backed article that answers one search intent, teaches an operational workflow, and positions Genfeed where it genuinely fits. Finish by invoking `$article-card-editorial` for the shared cover and OG card.

## Sources of truth

- Brief schema and HTML assembly: `apps/server/api/scripts/seeds/data/seo-article-builder.ts`
- Published launch articles: `apps/server/api/scripts/seeds/data/launch-articles.ts`
- Scheduled catalog examples: `apps/server/api/scripts/seeds/data/seo-articles-wave-*.ts`
- Catalog export: `apps/server/api/scripts/seeds/data/seo-articles.ts`
- Seed behavior and invariants: colocated `*.spec.ts` files

Read the builder and at least three nearby briefs before drafting. Match their object shape, field order, tone, and source-link format.

## Process

### 1. Define the search job

Write down:

- one primary search query;
- the reader and decision they need to make;
- the article type: guide, tutorial, comparison, listicle, or framework;
- the Genfeed capability that naturally helps after the answer is understood.

Separate close queries only when their intent or decision differs. Choose a canonical slug that is descriptive, lowercase, and stable.

### 2. Establish evidence

Research current claims before writing. Prefer first-party product documentation, specifications, platform guidance, and original research. Record each source as a descriptive label plus its canonical URL.

Treat dates, prices, model capabilities, platform rules, and product comparisons as volatile. Verify them in the current session. Remove any claim that cannot be supported or clearly framed as judgment.

Write only from earned experience. Keep launch reports, performance claims, and first-person case studies unpublished until the underlying event happened and evidence exists.

### 3. Write the brief

Complete every `SeoArticleBrief` field:

- `answer`: direct answer suitable for the short-answer section;
- `category`: the matching `ArticleCategory`;
- `decisionRows`: real choices, best fit, and accepted trade-off;
- `faq`: questions that resolve remaining purchase or implementation friction;
- `internalLinks`: relevant Genfeed, documentation, and neighboring article paths;
- `intro`: exactly two paragraphs that frame the problem without throat-clearing;
- `label`: precise search-facing title;
- `metrics`: workflow and outcome measures together;
- `mistakes`: concrete failure modes, not generic warnings;
- `publishedAt`: explicit ISO UTC timestamp;
- `sections`: article-specific reasoning that cannot be reused unchanged elsewhere;
- `slug`: canonical URL key and artwork filename stem;
- `sources`: current primary references;
- `summary`: one concise search-result description;
- `workflow`: ordered actions with observable outputs.

The shared builder already supplies the decision table, implementation workflow, Genfeed fit, measurement, mistakes, checklist, FAQ, internal links, and sources structure. Spend writing effort on the article-specific brief rather than duplicating that shell.

### 4. Edit for usefulness

Apply these editorial gates:

- Lead with the answer, then explain the decision.
- Give trade-offs instead of declaring a universal winner.
- Distinguish generated output from approved output.
- Connect Genfeed as the content operating layer, not as a forced answer to every problem.
- Use concrete nouns, actions, acceptance criteria, and metrics.
- Remove inflated claims, repetitive transitions, filler, and generic AI prose.
- Keep advice operational enough that a founder or content lead can run it.

Every article needs a distinct thesis. Reject a draft if changing only the title would make it fit another keyword.

### 5. Schedule and wire

Place the brief in the appropriate wave file and export it through the catalog. Use future `publishedAt` timestamps for scheduled posts; public article and RSS paths already gate future-dated records.

For a two-per-week cadence, leave several days between posts and avoid publishing two articles that target the same intent in one week. Preserve the canonical slug after publication.

Generate the artwork with `$article-card-editorial`. Save it as:

`s3://cdn.genfeed.ai/assets/cards/articles/<artwork-id>.webp`

Assign the next permanent `card-####` value in `ARTICLE_ARTWORK_IDS`. The builder resolves that stable identity through `articleArtwork(brief.slug)`, keeping titles and slugs out of storage filenames.

## Completion criteria

- The query, reader decision, and article thesis are each explicit.
- Every brief field is populated with article-specific content.
- Volatile claims were checked against current primary sources.
- No unearned first-person or launch claim remains.
- The publication timestamp and catalog export are correct.
- The article has one permanent artwork id and a matching `1280 x 720` WebP card at `https://cdn.genfeed.ai/assets/cards/articles/<artwork-id>.webp`.
- The article remains hidden before `publishedAt` and public afterward.
- Focused repository checks pass in CI; do not claim completion from prose review alone.

## Invocation examples

- `Use $seo-article-editorial to write the next article about AI content approval workflows.`
- `Use $seo-article-editorial and $article-card-editorial for a comparison article scheduled next Thursday.`
- `Audit this scheduled seed with $seo-article-editorial before it publishes.`
