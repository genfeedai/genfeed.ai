# Content harness

The content harness turns "who this brand is and what this post is for" into one
structured brief that every text, image, video and audio generation path reads.
This page follows a brief from input to output, then follows review feedback and
winning posts back into the next brief.

It describes what the code does today. It does not describe reinforcement
learning or self-improvement, and nothing here should be read as a claim that the
product learns on its own. See [What this does not do](#what-this-does-not-do).

Code lives in two places:

| Piece | Path |
| --- | --- |
| Contracts, built-in packs, `composeContentHarnessBrief` | `packages/harness/src/` |
| Pack loading, profiles, retrieval, review feedback, winner promotion | `apps/server/api/src/services/harness/` and `apps/server/api/src/collections/harness-profiles/` |

## Contracts

All types are in `packages/harness/src/types.ts`.

**`ContentHarnessInput`** is what a caller builds for one generation. The fields
that matter:

| Field | Meaning |
| --- | --- |
| `intent` | Required. `contentType` (`post`, `thread`, `image`, `video`, `music`, and so on), `objective` (`authority`, `awareness`, `conversion`, `engagement`, `retention`), plus optional `platform`, `topic`, `offer`, `audienceHint`, `campaignId`. |
| `organizationId`, `brandId`, `brandName` | Which tenant and brand the brief is for. |
| `voiceProfile`, `personaProfile` | Brand voice (tone, style, audience, pillars, `doNotSoundLike`) and persona anchors. |
| `identityContribution` | Approved Brand OS identity, merged first. |
| `profileContribution` | The brand's harness profile, read by the `core-baseline` pack. |
| `learningContribution` | A pre-built contribution merged last, supplied by the branded-generation path. |
| `sources` | Extra `HarnessSourceRecord`s, such as retrieved brand memory. |

**`ContentHarnessContribution`** is what one layer adds: `systemDirectives`,
`styleDirectives`, `guardrails`, `evaluationCriteria`, `providerHints` and
`sources`.

**`ContentHarnessPack`** is a named, versioned contributor: `id`, `version`, an
optional `surfaces` list, and `contribute(input)`, which may be async. A pack
with no `surfaces` applies everywhere. A pack that lists `['copy']` is skipped
when the caller asks for the `media` surface, so copywriting rules never leak into
an image or video prompt.

**`ContentHarnessBrief`** is the result: the merged lists above, plus
`packs` (every registered pack that applied to the surface), `appliedPacks`
(packs that actually added something), and `metadata`.

**`ContentHarnessReceipts`** sits on the brief as `receipts`. It records whether an
approved Brand OS revision shaped the brief (`brandOs: 'approved'` with a
`brandOsRevisionId`, or `brandOs: 'none'`) and the `harnessProfileId` when a
profile contributed. Receipts hold identifiers only, never pack or profile text.

## How a brief is composed

`composeContentHarnessBrief(registry, input, { surface })` does this, in order:

1. Merge `input.identityContribution`, if present.
2. Walk the registered packs in registration order. Skip packs not applicable to
   the requested `surface`. Call `contribute(input)`, record the pack in
   `appliedPacks` if it added at least one non-empty directive or source, and
   merge the result.
3. Merge `input.learningContribution`, if present.
4. Return the brief with receipts.

Merging trims strings and drops duplicates within each list, and drops sources
with an id already seen. Order therefore decides which copy of a duplicate
survives, but nothing is overwritten.

Two consequences worth knowing:

- The composer itself does not read `profileContribution`. The `core-baseline`
  pack does. A registry without `core-baseline` ignores the brand's harness
  profile.
- `ContentHarnessRegistry.registerPack` keys on `id`. Registering a pack whose id
  is already taken replaces the earlier pack, keeping its position.

`formatHarnessBrief` (API side) renders a brief into prompt sections, and
`buildMediaPromptFromHarness` folds one into an image, video or audio prompt. For
visual kinds it appends a short brand look rather than the whole brief.

## Built-in packs

The API registers these nine at startup, in this order
(`ContentHarnessService.loadRegistry`):

| Pack id | Source | Contributes |
| --- | --- | --- |
| `core-baseline` | `defaults.ts` | Brand name, topic and offer; tone, style, audience, pillars and values from the voice profile; persona anchors; objective, platform and format evaluation criteria; the brand's harness profile; generic anti-filler guardrails. For `music`, a reduced voice-only variant. |
| `platform-x` | `platforms/x-algorithm.ts` | Craft rules, guardrails and criteria, only when `intent.platform` is X or Twitter. Returns nothing for any other platform. |
| `platform-linkedin` | `platforms/linkedin.ts` | Only when `intent.platform` is LinkedIn: a hook that survives the "see more" fold, readable structure, no links in the body, at most five hashtags, the shared caption limit. Copy surface only. |
| `platform-instagram` | `platforms/instagram.ts` | Only when `intent.platform` is Instagram or Reels: a hook in the first 125 caption characters, captions that add to the visual, carousel and Reels structure, the shared caption limit. Copy surface only. |
| `platform-tiktok` | `platforms/tiktok.ts` | Only when `intent.platform` is TikTok: a true hook in the first seconds, one idea per video, a searchable caption, disclosure. Copy surface only. |
| `platform-youtube` | `platforms/youtube.ts` | Only when `intent.platform` is YouTube or Shorts: searchable titles and descriptions, a payoff that matches the click, Shorts and long-form openings. Copy surface only. |
| `brand-fidelity` | `brand-fidelity.ts` | Anti-genericity guardrails and a "would someone who knows this brand recognise it" criterion. Returns nothing for `music`. |
| `viral-psychology` | `persuasion/viral-psychology.ts` | Demand, hook, retention and conversion craft, and the matching score keys. Registered with `surfaces: ['copy']`, so it never reaches media prompts. |
| `b2b-media-craft` | `b2b-media-craft.ts` | For `video`, `ugc`, `image` and `ad-creative` briefs whose audience, offer or topic reads as business buyers: one action arc, a real product anchor, no model-rendered logos, interface or text. Registered with `surfaces: ['media']`, so it never reaches copy. Returns nothing for `music`. |

Caption limits in the platform packs come from `PLATFORM_PREVIEW_LIMITS` in
`@genfeedai/contracts/constants`, the same table the post previews use.

The platform packs replace the full product skills that branded generation used to
inject for these channels. When a brand has not picked skills, a turn on X,
LinkedIn, Instagram, TikTok or YouTube adds no skill text
(`default-first-party-skills.ts`); skills the brand enables or the caller
requests still load, and agent-type defaults are unchanged. The public
`SKILL.md` files in `skills/` stay the long form for agent users.

The X pack encodes durable implications of X's published ranking material:
conversation and reposts matter more than likes, and negative feedback is heavily
penalised. It is craft guidance. It is not a reimplementation of X's ranker.

## Org-scoped harness profiles

A harness profile is a per-brand record, stored under the owning organization, that
holds the brand's thesis (beliefs, enemies, offers, proof points and the Expert
Path fields), voice, structure rules, guardrails, and `examples.good` and
`examples.avoid` lists. The contract is `IHarnessProfile` in
`packages/contracts/src/interfaces/ai/harness-profile.interface.ts`.

- Every read and write takes the `organizationId`. Profiles are looked up by
  organization and brand, so one tenant's profile does not enter another's brief.
- `pickActiveHarnessProfile` chooses the brand's profile: the active default, else
  any active one, else the newest.
- `HarnessProfilesService.resolveContributionForBrand` converts the chosen profile
  into a `ContentHarnessContribution`. Good examples become `brand_example`
  sources, avoid examples become `anti_example` sources, and banned phrases become
  guardrails. The profile id is stamped into the brief's receipts.
- `HarnessGenerationService.resolveBrief` is the entry point for generation
  paths. After the brand access check it loads the brand, the approved Brand OS
  revision, the profile and, when there is a topic, retrieved brand memory, then
  composes the brief. If anything after the access check throws, it logs a warning
  and returns `null` rather than failing the generation.

Brand memory comes from the Postgres vector store: by default up to five hits at
relevance 0.65 or higher. That is where promoted winners come back in. See below.

## External packs

A deployment can add packs beyond the built-in ones by naming npm packages in
`CONTENT_HARNESS_PACKAGES`, a comma-separated list. The config schema validates
the list. Pack contents belong to the operator who supplies them and never
appear in this repository.

At API startup, for each specifier:

1. Resolve it with `require.resolve` relative to the API package.
2. `require` it, and take the module's `default` export if that is a pack,
   otherwise its `CONTENT_HARNESS_PACK` export.
3. Accept it as a pack if it has a string `id` and a string `version`. That is the
   whole structural check. `contribute` is not inspected until a brief is composed.
4. Register it after the built-in packs. A pack reusing a built-in id replaces
   that built-in.

Each specifier ends in one activation state, reported by
`ContentHarnessService.getActivationReport()`:

| State | Meaning |
| --- | --- |
| `loaded` | Resolved, imported, and exported a valid pack. The report carries `packId` and `packVersion`. |
| `unresolvable` | The specifier does not resolve to a module. |
| `invalid` | The module loaded but exported nothing that passes the pack check. |
| `load_failed` | Resolving or importing threw. The report carries the error message. |

If any specifier is in a state other than `loaded`, `loadRegistry` throws and the
API refuses to start. It does not fall back to the built-in packs. With
`CONTENT_HARNESS_PACKAGES` unset, only the built-in packs load, and that is a
normal configuration.

The report also lists `builtInPackIds` and `loadedPackIds`. Built-in packs never
count as an activated external pack.

A platform admin reads the report of a running API at
`GET /admin/harness/activation` (super admin, and the caller's IP must be on
`ADMIN_ALLOWED_IPS`). It returns the built-in pack ids, each external
specifier with its state, and every registered pack with its version, never pack
contents. From the CLI:

```bash
genfeed admin harness                      # list loaded packs and external states
genfeed admin harness --expect <pack-id>   # exit non-zero unless that pack loaded externally
```

`--expect` fails for a pack id that only a built-in pack provides, so a fallback
to the built-in packs never passes as activation. The startup log line and the
boot smoke test remain the other evidence.

At brief time, `appliedPacks` tells you which packs actually contributed, and
`HarnessGenerationService` logs it as an operator-only receipt: pack ids and
versions, not content.

## Review rejection to anti-example

When a human reviewer rejects generated content, the harness remembers what to
avoid. `HarnessReviewFeedbackService.recordReviewDecision` is called from the
turbo-run review flow (`sourceType: 'turbo_run_item'`) and from workflow review
gates (`sourceType: 'workflow_review_gate'`).

- Only `rejected` and `request_changes` do anything. `approved` and `unset` are
  deliberate no-ops.
- It does nothing if the content has no brand, the content is empty, or the brand
  has no harness profile.
- The rejected content is cut to 480 characters and appended to the active
  profile's `examples.avoid`, together with an `avoidFeedback` entry that holds the
  source stamp, the reviewer's reason, a timestamp and `isAutoAdded: true`.
- The same review decision is recorded once. A second call with the same
  `sourceType:sourceId` is ignored.
- At most 20 `avoidFeedback` entries are kept. The oldest auto-added entries are
  evicted first. Anti-examples that an operator wrote, or that came from a seed,
  are never evicted and never counted against the cap.
- Failures are logged and swallowed, so a feedback write can never fail the review
  action that triggered it.

On the next generation the stored anti-example reaches the brief as an
`anti_example` source from the profile contribution.

## Winner promotion

`HarnessWinnerPromotionService` is the positive side. It takes a brand's top posts
from the weekly performance summary and writes them into a per-brand
`harness-performance-winners` context base, embedded in the vector store.

- A daily autopilot workflow (`harness.winners.promote`, cron `0 8 * * *` in the
  Content Loop Autopilot template) sweeps each organization. It considers brands
  that have a connected credential, with a cap of 25 brands per sweep and 5
  winners per brand. A cache lock stops two sweeps overlapping for the same
  organization. The workflow is installed from the template catalog, so it runs
  only where an organization has installed it.
- A post is skipped when its post id, or its exact text, matches one of up to 100
  existing entries in the winners base.
- Each entry stores the post text with its engagement rate and platform, tagged as
  a `performance_winner`.
- At generation time, with a topic present, similar winners are retrieved as
  brand-memory sources like any other memory hit.

Promotion is retrieval fuel for few-shot examples. It does not change the model,
the packs, or the profile.

### The X public-metric proxy, and its limits

For posts on X, winners are re-ranked with `scoreXPublicMetricsPer1k` before the
cut, instead of by flat engagement rate. It scores a post from the counts Genfeed
stores, weighted from X's 2023 open-source Heavy Ranker table:

| Stored metric | Stands in for | Weight |
| --- | --- | --- |
| `comments` | reply | 13.5 |
| `saves` | high-intent click | 10.0 |
| `authorClosedLoops` | reply the author engaged with | 75.0 |
| `shares` | repost | 1.0 |
| `likes` | favourite | 0.5 |

The score is divided by views and scaled to 1,000 views when views exist.

What this does not tell you:

- The weights are a published 2023 snapshot. Production ranking has changed and is
  not public. This is a proxy for conversation-heavy posts, not X's actual score.
- Dwell time, reports, blocks and mutes are not in the stored metrics. They are
  handled as craft guardrails in the pack, not as score terms.
- `authorClosedLoops` is only as good as the reply loop counting it. Where nothing
  counts it, it is zero.
- Counts are small for most brands. A high score on a few interactions is weak
  evidence.
- Only X posts get this treatment. Other platforms keep their existing order.

## What this does not do

This system composes briefs, stores reviewer rejections, and keeps a library of
past posts that performed. That is context assembly and retrieval.

It does not train or fine-tune a model, run a policy against a reward, compare
experiment arms, or adjust itself from outcomes. The `learning` code under
`packages/harness/src/learning/` and the content-eval suites are separate and are
not covered here; see [content-evals.md](content-evals.md). Treat any claim of
reinforcement learning or self-improvement as unsupported by this page.

## Where to start reading

1. `packages/harness/src/types.ts`, then `compose.ts` and `defaults.ts`.
2. `apps/server/api/src/services/harness/harness.service.ts` for pack loading.
3. `harness-generation.service.ts` for how a real brief is assembled.
4. `harness-review-feedback.service.ts` and `harness-winner-promotion.service.ts`
   for the two feedback paths.
5. `harness.service.spec.ts` and `packages/harness/__tests__/` for behaviour pinned
   by tests.
