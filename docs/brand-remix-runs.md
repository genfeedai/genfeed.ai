# Brand-Aware Remix Runs

Brand-aware remix runs turn an eligible source in Discover into original,
editable creative without moving prompts or media URLs between product
surfaces.

The operator flow is:

```text
Discover or Ads -> Remix -> inspect the prefilled brief -> Studio ->
Library output -> Review -> downstream draft
```

## Eligible sources

Remix is offered only when Genfeed has a durable source identity that the
active organization and brand are allowed to use.

| Surface | Eligible source | Durable selector |
| --- | --- | --- |
| Trends | Captured TikTok trend or followed post | Trend reference or source-post ID |
| Organic research | Imported, followed, or owned post | Source-post or owned-post ID |
| Ads research | Captured public Meta, Google/YouTube, or TikTok ad | Public-ad snapshot ID |
| Connected ads | Ad from an authorized connected account | Credential, account, and ad IDs |

An item without a durable reference does not expose Remix. Deleted, stale,
foreign, or unauthorized selectors fail before generation or credit use.
Source captions, scripts, media, handles, people, and watermarks are not copied
into the generation prompt. The server compiles reusable signals such as the
hook, angle, structure, pacing, offer, call to action, placement, and visual
treatment.

## What is prefilled

Opening Remix creates or reuses a server-authorized draft `ContentRun`. The
server combines the resolved source pattern with the active brand's voice,
harness, output recommendation, review policy, and available Library defaults.
Navigation carries only the run ID; refreshing or reopening Studio restores the
same editable run.

Before starting generation, the operator can change:

- the output kind, platform preset, aspect ratio, duration, and variation count;
- Guided or Strict fidelity;
- Library references and their semantic roles;
- the avatar and speech voice for avatar output.

Explicitly selected references override brand defaults. Durable asset, avatar,
and voice IDs are stored in the run. Provider delivery URLs are resolved only
when dispatching and are not persisted in the brief snapshot.

## Readiness and fidelity

Guided fidelity is the default. Unsupported optional signals are omitted with a
visible degraded reason. Missing provider access, required identity, or another
required input blocks generation with an actionable readiness issue.

Strict fidelity must not silently degrade. Until a generation route can enforce
the selected references deterministically, Strict requests remain blocked
before provider dispatch and consume no credits.

Provider routing follows the normal execution boundary: organization BYOK,
configured server providers, then an explicit supported managed-cloud route.
Community and self-hosted installations can remix owned or imported sources
without public trend providers, but generation is available only for output
types backed by their configured providers.

## Outputs, review, and lineage

All requested variations stay grouped under one run. Each usable output is an
existing Library `Ingredient`, linked through a `ContentRunVariant`; the run
records requested and actual counts, recipe/compiler versions, source pattern,
reference roles, and partial or degraded results.

For media runs, Genfeed reserves and links one run-scoped `Ingredient` for
every requested output before the first provider call. A retry adopts only
placeholders owned by that run and variant index. Reservations that never
reached a provider are failed and safely recreated; provider-dispatched work is
left in flight and reconciled instead of being charged twice. Copy variations
use the same grouped manifest and retain their generated text directly on each
variant.

Sending variants to Review uses the existing manual-review batch inside an
immutable system workflow execution. It creates idempotent canonical draft
`Post` records with source, run, recipe, variant, Ingredient, workflow, and
workflow-execution lineage, and does not publish them. Approval without a
schedule leaves organic posts in draft state for an explicit downstream
publish action. Run, variant, generation, workflow, Post, ad, and performance
IDs preserve the lineage needed to compare results later without treating
correlation as causation.

## Paid Meta boundary

An approved paid remix sourced from an authorized connected Meta ad can create
or resume a campaign draft. The internal workflow verifies the connected Page
and selected ad account, validates the approved Post and Library Ingredient,
uploads media only when necessary, and deterministically creates or reuses the
campaign, ad set, and ad. It then forces all three objects to `PAUSED`, including
on replay. The remix surface exposes no activation method, so enabling spend
remains a separate explicit Ads Manager action.

The draft campaign carries a conservative 5 units/day in the ad account's
billing currency so Meta can materialize the campaign hierarchy. Because every
object is paused, that budget cannot spend until an operator separately reviews
and activates the campaign in Ads Manager.

Public Meta research remains eligible for creative prefill, but it cannot be
used as authority to write to an ad account. A paid handoff therefore requires
the stable credential, ad-account, and ad IDs from a connected source.

## Security invariants

- Source, brand, credential, reference, identity, output, and downstream IDs are
  authorized in the active organization and brand scope.
- Signed source or Library delivery URLs are never accepted as durable asset
  IDs.
- Source resolution and reference authorization complete before provider or
  credit-consuming work.
- Provider-facing prompts contain abstract source patterns, not source copy.
- Reopening or polling a run uses the persisted run revision and stable output
  identities rather than reconstructing state in the browser.

## Related documents

- [Core and Cloud Execution Boundaries](./execution-boundaries.md)
- [Deployment Modes](./deployment-modes.md)
- [Identity & Request Resolution](./identity-resolution.md)
