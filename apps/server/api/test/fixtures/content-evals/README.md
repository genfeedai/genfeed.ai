# Content evaluation fixtures

## Layout

- `judge/`: existing judge fixtures; untouched by golden-set generation.
- `ladder/`: existing ladder fixtures; untouched by golden-set generation.
- `golden/`: generated golden set v1 fixtures, one `{contentKind}.synthetic.jsonl` file per kind, plus `label-quality.synthetic.json`.

The public pack contains 45 social-post rows and 36 rows for each of thread, article, script, newsletter and image-caption, spanning three derived synthetic brand identifiers per kind. All content is invented in [synthetic-seed.ts](../../../scripts/evals/synthetic-seed.ts). Real-brand rows are never committed here.

## Row shape

The schema is [`fixtureRowSchema` in scripts/content-eval/rows.ts](../../../../../../scripts/content-eval/rows.ts). Each JSONL file starts with a `//` generation header; every subsequent non-empty line is one schema-valid row. For example, this row comes from the synthetic social-post file:

```json
{
  "brandFixtureId": "brand-9f67307233a7",
  "contentKind": "social-post",
  "expected": { "decision": "approve" },
  "id": "gs1-social-post-018581db7587ed65",
  "input": {
    "brief": { "bannedPhrases": [], "isCtaRequired": false },
    "output": "An invented seed about a calm morning ritual from brand-9f67307233a7. Begin with one observable detail. brand-9f67307233a7 at [organization]. [person] and [person] share [handle], [url] and [email]. Reference [id].",
    "prompt": "Write a social post for brand-9f67307233a7's audience."
  },
  "rubricVersion": "content-quality-v1",
  "source": { "reference": "golden-set-v1:harness-seed", "visibility": "synthetic" }
}
```

## Source-to-kind mapping

**D-3 Source → kind mapping (exact).**

| Record | Condition (in order) | contentKind | Text (`input.output`) | Prompt base |
|---|---|---|---|---|
| Post, `parentId` null | `format === PostFormat.THREAD` | `thread` | root `description` + `"\n\n"` + children `description`s ordered by (`order` asc, `createdAt` asc, `id` asc) | `promptUsed` |
| | `category === PostCategory.ARTICLE` | `article` | `description` | `promptUsed` |
| | `category === PostCategory.IMAGE` | `image-caption` | `description` | template |
| | `category ∈ {VIDEO, REEL, STORY}` | `script` | `description` | `promptUsed` |
| | `category ∈ {TEXT, POST}` | `social-post` | `description` | `promptUsed` |
| Post, `parentId` non-null | always | excluded `unsupportedKind` | | |
| Batch item | `data.type === 'engagement'` | excluded `unsupportedKind` | | |
| | `data.format ∈ {ContentFormat.IMAGE, ContentFormat.CAROUSEL}` | `image-caption` | `data.caption` | template |
| | `data.format ∈ {VIDEO, REEL, STORY}` | `script` | `data.caption` | template |
| | any other format | excluded `unsupportedKind` | | |
| Article (via evaluation) | `evaluation.contentType === 'article'` | `article` | `content ?? summary` | template |
| Newsletter | always | `newsletter` | `content ?? summary` | `generationPrompt` |
| Harness winner | `metadata.postId` resolves to a post | that post's kind | that post's text | per post |
| | otherwise | `social-post` | `data.content` with `/^Winning post[^:]*: /` removed | template |
| Harness avoid feedback | `source` resolves (D-5) | referenced record's kind | referenced record's text | per record |
| | otherwise | `social-post` | `content` | template |
| Harness seed (`examples.good`, untracked `examples.avoid`) | always | `social-post` | the example string | template |

Row fields:
- **`KIND_PROMPT_TEMPLATES`:**
  - social-post: `Write a social post for {brandFixtureId}'s audience.`
  - thread: `Write a thread for {brandFixtureId}'s audience.`
  - article: `Write an article for {brandFixtureId}'s audience.`
  - script: `Write a short video script for {brandFixtureId}'s audience.`
  - newsletter: `Write a newsletter for {brandFixtureId}'s audience.`
  - image-caption: `Write an image caption for {brandFixtureId}'s audience.`
- **Prompt:** a prompt base that is null, or empty after anonymisation, falls back to the template. Prompt and text are both anonymised (D-8).
- **`input.platform`:** the lowercase post `platform`, batch `data.platform` or winner `metadata.platform`. Omitted when absent.
- **`input.brief`:** always `{ "bannedPhrases": [], "isCtaRequired": false }`.
- **`rubricVersion`:** `GOLDEN_SET_RUBRIC_VERSION = 'content-quality-v1'`.
- **`source.reference`:** `"golden-set-v1:"` + the sorted kept label sources joined by `"+"`. It never contains ids.
- **Text normalisation:** `\r\n` → `\n`, then trim. Text that is empty after anonymisation excludes the row as `emptyText`.

## Label sources and score bands

**D-4 Label sources and decisions.**
`GOLDEN_LABEL_SOURCES` (sorted): `batch-item-review`, `evaluation-decision`, `evaluation-score`, `harness-avoid`, `harness-seed`, `harness-winner`, `newsletter-approval`, `post-review`.
A label is `{ source, raterKey, decision: 'approve'|'reject'|null, score: number|null, order: [epochMs, recordId] }`.
- **post-review / batch-item-review.** Parse with `parseReviewDecision`:
  - `approved` → approve; `rejected`/`request_changes` → reject; `unset`/`unknown` → no label.
  - If `reviewEvents` has at least one event with a string `reviewerId`, emit one label per `reviewerId` from that reviewer's latest event. Latest means max of (`Date.parse(reviewedAt)`, NaN = −∞), then array index.
  - Otherwise emit one column label with `raterKey = 'column'`.
- **evaluation-decision.** From `data.review.decision`: `approved` → approve; `rejected`/`needs_changes` → reject; `neutral` → no label. `raterKey = review.reviewerId`. Also emit one label per other `reviewerId` in `data.reviewerComments` that has a decision, using that reviewer's latest entry by `createdAt` and skipping `review.reviewerId`.
- **evaluation-score.** From `data.review.reviewerScore`, finite, clamped to [0,100], with `raterKey = review.reviewerId`. Approve when `score / 100 >= CONTENT_EVAL_THRESHOLDS.acceptedMinScore`; otherwise reject.
- **newsletter-approval.** Approve when `approvedAt` and `approvedByUserId` are both non-null. `raterKey = 'approval'`.
- **harness-avoid.** Reject, `raterKey = 'avoid'`.
- **harness-winner.** Approve, `raterKey = 'engagement'`.
- **harness-seed.** `good` → approve. An avoid string equal to no `avoidFeedback[].content` → reject. `raterKey = 'operator'`.
- **Band.** `i = min(3, floor(score / 25))`, `scoreBand = { min: i * 0.25, max: (i + 1) * 0.25 }`. The row band comes from the evaluation-score label with the greatest (evaluation `createdAt`, `id`).
- **Never exported:** reviewer comments and feedback text.

## Agreement and label-quality report

**D-6 Agreement and floor.** `AGREEMENT_FLOOR = { minKappa: 0.4, minPairs: 20, minPercentAgreementWhenKappaUndefined: 0.8 }`.
- **Pairs:** per content key, every unordered pair of labels that both have a non-null decision and do not share (`source`, `raterKey`).
  - Each pair goes into both sources' lists, or once if both labels share a source.
  - Orientation is (this source, other). Same-source pairs are ordered by `raterKey` code point.
- **Statistics:** `n` is the pair count, `po = agree/n`, and `pA` is the approve share per side. `pe = pA1·pA2 + (1−pA1)(1−pA2)` and `kappa = (po − pe)/(1 − pe)`. Kappa is null when `1 − pe === 0`.
- **Status:**
  - `insufficient-overlap` when n < 20 (the source is kept);
  - `kept` when kappa ≥ 0.4, or when kappa is null and po ≥ 0.8;
  - `dropped` otherwise.
- **Pass 1** computes statistics. **Pass 2** removes `dropped` sources' labels and then resolves rows:
  - both approve and reject remain (score-derived included) → `conflict`;
  - no decision and no band → `noLabel`;
  - otherwise set `expected.decision` for a single decision, and `expected.scoreBand` per D-4.
- **Rounding:** report numbers use `Math.round(x * 1e4) / 1e4`.

**D-7 Label-quality report.** Written to `{outDir}/label-quality.{visibility}.json` as `JSON.stringify(report, null, 2) + "\n"`. Keys:
- `schemaVersion: 1`, `setVersion: 'golden-set-v1'`, `visibility`, `window: {from, to} | null`, `scopeCount`, `agreementFloor`;
- `sources: [{ source, labels, pairs, percentAgreement|null, kappa|null, status }]`, sorted by source;
- `kinds: [{ contentKind, rows, brands, approve, reject, withScoreBand }]`, in `GOLDEN_CONTENT_KINDS` order;
- `excluded: { conflict, copyOfReview, emptyText, missingContent, noBrand, noLabel, outOfScopeBrand, residualIdentifier, unsupportedKind }`.

No timestamps, ids, text or brand names appear. Every array holds objects, so the file is already in Biome's JSON layout.

## Anonymiser contract (D-8, verbatim)

**D-8 Anonymiser.** `anonymiser.ts` exports:
- `prepareTerms(context): PreparedTerm[]`
- `anonymiseText(text, context): string`
- `findResidualIdentifiers(text, context): ResidualCategory[]`
- `buildAnonymisationContext(snapshot, brandFixtureIdsByBrandId): AnonymisationContext`

Types:
- `AnonymisationContext = { knownIds: string[]; brandTerms: Array<{ term: string; brandFixtureId: string }>; organizationTerms: string[]; personTerms: string[] }`
- `PreparedTerm = { term: string; token: string }`
- `ResidualCategory = 'brand' | 'email' | 'handle' | 'id' | 'organization' | 'person' | 'url'`

*Context building.* Values that are null, non-string or empty after trim are skipped.
- **knownIds:** the org id, every brand id and every snapshot record id.
- **brandTerms:**
  - each brand's `label` and `slug` → its `brandFixtureId`;
  - each credential's `externalHandle`/`externalName`/`username` whose `brandId` is a snapshot brand → that brand;
  - each string in a harness profile's `data.handles` (array elements, or object values one level deep) whose profile `data.brandId` is a snapshot brand → that brand.
- **organizationTerms:** the org `label` and `slug`; credential values whose `brandId` is null or not a snapshot brand; profile handles without a resolvable brand.
- **personTerms:** each member user's `firstName`, `lastName`, `name` and `handle`, plus `firstName + ' ' + lastName` when both are non-empty.

*Handle decision.*
- Any `@`-prefixed handle in text becomes `[handle]` (A4), including credential and profile handles. A4 runs before A6, so A6 never sees `@kelder_studio`.
- The same value without `@` (`kelder_studio`) is a known term. It becomes the owning brand's `brandFixtureId`, or `[organization]` for an org-level credential.
- Reason: one uniform handle token, independent of credential registration.

*`prepareTerms` (deterministic).*
1. Build entries: `brandTerms` → token = its `brandFixtureId`; `organizationTerms` → `[organization]`; `personTerms` → `[person]`.
2. Trim each term and strip one leading `@`.
3. If a term contains `-`, also add a variant with every `-` replaced by a space, with the same token.
4. Drop terms whose `.length < 3`.
5. Group by `term.toLowerCase()` and give each group one token:
   - brand entries with exactly one distinct `brandFixtureId` → that id;
   - brand entries with two or more distinct ids → `[organization]`;
   - otherwise, organization entries → `[organization]`;
   - otherwise `[person]`.
6. Return `{ term: lowercase key, token }`, sorted by `term.length` descending, then code point ascending.

*knownIds preparation:* trim, drop empties, dedupe exactly, sort by length descending, then code point ascending.

`escapeRegExp(s) = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. It does not escape `-`, because `\-` is invalid under the `u` flag.

*Rules* (in order, applied to the **original** text):

| # | Rule | Pattern | Token |
|---|---|---|---|
| A1 | known ids | per prepared id: `new RegExp(escapeRegExp(id), 'g')` (case-sensitive, no boundaries) | `[id]` |
| A2 | emails | `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` | `[email]` |
| A3 | scheme/www URLs | `/\b(?:https?:\/\/\|www\.)[^\s<>"'()\[\]]*[^\s<>"'()\[\].,!?;:]/gi` | `[url]` |
| A4 | handles | `/(?<![\p{L}\p{N}_@\/])@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?/gu` | `[handle]` |
| A5 | bare domains | `/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com\|net\|org\|io\|ai\|co\|app\|dev\|shop\|store\|me\|tv\|fm\|xyz\|uk\|de\|fr\|eu\|us\|ca\|au\|example)\b(?:\/[^\s<>"'()\[\]]*[^\s<>"'()\[\].,!?;:])?/gi` | `[url]` |
| A6 | known terms | per prepared term, in `prepareTerms` order: `new RegExp('(?<![\\p{L}\\p{N}_])' + escapeRegExp(term) + '(?![\\p{L}\\p{N}_])', 'giu')` | the term's token |
| A7 | honorific names | `/\b(?:Mr\|Mrs\|Ms\|Mx\|Dr\|Prof)\.?\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/gu` | `[person]` |
| A8 | cuid | `/\bc[a-z0-9]{24}\b/g` | `[id]` |
| A9 | UUID | `/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi` | `[id]` |
| A10 | ObjectId | `/\b[0-9a-f]{24}\b/gi` | `[id]` |

*Claim algorithm.* `claims` starts as an empty list of `{ start, end, token }`. For each rule in order (within A1/A6, each id or term in prepared order), iterate `text.matchAll(pattern)` on the original text. Each match gives a candidate `[index, index + match[0].length)`:
- **Partial overlap:** the candidate overlaps a claim (`c.start < end && start < c.end`) without containing it (`start <= c.start && c.end <= end`) → skip the candidate.
- **Containment:** the candidate contains one or more claims and partially overlaps none → remove them and claim the candidate. An equal span counts as containment.
- **No overlap:** claim the candidate.

Output is the original text with the claims, sorted by `start`, replaced by their tokens. No rule matches inside an emitted token.

*Residual detector (`findResidualIdentifiers`).*
1. Seed `claims` with every match of `ANONYMISER_TOKEN_PATTERN = /\[(?:email|handle|id|organization|person|url)\]|\bbrand-[0-9a-f]{12}\b/g`.
2. Run the claim algorithm with A1–A6 and A8–A10. A7 is a heuristic, not a detector.
3. Each newly claimed (non-seed) candidate yields a category:
   - A1/A8/A9/A10 → `id`; A2 → `email`; A3/A5 → `url`; A4 → `handle`;
   - A6 → `brand` when the token starts with `brand-`, `organization` for `[organization]`, `person` for `[person]`.
4. Return the sorted unique categories.

A residual in `input.output` or `input.prompt` excludes the row as `residualIdentifier`. This is a hard gate.

Over-redaction is accepted: a person term that is also a common word is replaced wherever it stands as a whole word. The README documents D-8 verbatim.

## Identifier derivation and key handling

`hmacHex(key, message) = createHmac('sha256', key).update(message, 'utf8').digest('hex')`.

- `brandFixtureId = 'brand-' + hmacHex(key, 'brand:' + organizationId + ':' + brandId).slice(0, 12)`.
- Row `id = 'gs1-' + contentKind + '-' + hmacHex(key, 'row:' + organizationId + ':' + contentKey).slice(0, 16)`.
- Duplicate output identifiers throw.
- Synthetic exports use the public `SYNTHETIC_ANONYMISER_KEY` constant in [golden-set.constants.ts](../../../scripts/evals/golden-set.constants.ts), solely for synthetic data.
- Database exports read a trimmed key of at least 32 characters from `--key-file={absolute path}`. The path must resolve outside the repository root (`path.resolve(import.meta.dirname, '../../../../..')` in the exporter).
- Vincent holds the database key in a personal secret store. It is never committed, logged or passed through an environment variable. No private key material belongs in this README.

## Regeneration

Run from `apps/server`:

```sh
bun api/scripts/evals/export-golden-set.ts --source=synthetic --out-dir=api/test/fixtures/content-evals/golden
```

Rows are sorted by identifier using code-point comparison and serialised with canonical JSON plus a trailing newline. The report has no timestamps. Repeating generation with the same inputs produces identical bytes. Do not edit generated files by hand or run Biome with `--write` on them. A kind with zero rows has no file; the exporter never deletes existing files.

[synthetic-fixtures.spec.ts](../../../scripts/evals/synthetic-fixtures.spec.ts) compares the committed pack to the rebuilt seed, checks counts and visibility, verifies the three derived brands, and scans for residual identifiers and raw synthetic terms.

## Private set and loading

Private real-brand fixtures belong in `genfeedai/harness:src/data/evals/`. Set `CONTENT_EVAL_PRIVATE_FIXTURES` to the absolute path of that directory in a harness checkout. The documented invocation, from the repository root, is:

```sh
bun run eval:content -- --suite=judge --fixture="${CONTENT_EVAL_PRIVATE_FIXTURES:?CONTENT_EVAL_PRIVATE_FIXTURES is not set}/social-post.private.jsonl" …
```

The runner loads absolute paths directly and reports them as `external:{basename}`. The `:?` guard fails in the shell before the runner starts if the variable is unset or empty. This variable is the single configuration point for private fixture loading; it does not require a native runner environment lookup.

Real-brand rows are never committed to this repository. Database exports require explicit Vincent authorization on #4923, an authorized scope and window, and output and key-file paths outside this repository. The private export remains gated ("not yet", 2026-10-03).
