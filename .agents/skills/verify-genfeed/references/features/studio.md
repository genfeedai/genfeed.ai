# Studio

## What exists
There is no bare `/studio` route (hard cut). The studio surfaces are top-level tools:
`/playground` (single asset, every generatable type behind one prompt bar),
`/storyboard` (+ `/storyboard/new`), `/clipper` (+ `/clipper/new`), `/editor`
(+ `/editor/new`), `/turbo` (+ `/turbo/new`) and `/motion`. One-off image and video
generation also lives in the Agent (`agent-chat.md`). Routes are `APP_ROUTES` in
`packages/contracts/src/constants/routes.constant.ts`; paths are org-scoped in the app.

## How a user reaches it
Sidebar entries for each tool, or the org-scoped URL directly. Generated results land in
the Library (`library.md`).

## How to drive it
Specs under `playwright/e2e/tests/studio/`: `playground-history-retry`,
`playground-preview-recovery`, `playground-failed-card-details`,
`playground-feedback-timing`, `playground-video-actions-drafts`, `storyboard-draft`,
`storyboard-runs`, `storyboard-asset-entry`, `clipper`, `turbo`,
`turbo-clips-interactions`, `image-editing`, `generation-spend`,
`generation-setup-responsive`, `reference-mentions-acceptance`,
`workspace-split-acceptance`. Real generation is covered by
`playwright/e2e/tests/core/crun-image-generation.spec.ts` and
`crun-video-generation.spec.ts`.
Run one with the single-spec lane in SKILL.md, for example:
`bunx playwright test --config=playwright/configs/playwright.config.ts --project=app-core playwright/e2e/tests/studio/turbo.spec.ts`.
Prompt bar selectors: `prompt-bar.md`.

## What usually breaks
- Real provider calls: the network guard aborts cost-risk hosts. Generation proofs must
  mock the provider or use the mocked core specs; never spend credits to verify.
- Spend and credit UI is gated on billing mode; see `billing-credits.md`.
- Heavy routes compile on first hit under Turbopack, so the first navigation is slow.
- Routes were renamed with hard cuts and no redirects; a spec or doc that still uses
  `/studio/...` is stale.
