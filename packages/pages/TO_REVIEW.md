# `packages/pages` TO REVIEW

Originally generated during the ownership sweep on 2026-04-09. Updated 2026-04-10 after per-file consumer verification surfaced 4 systemic classification errors in the original sweep.

## Purpose

- Preservation ledger for shared page modules whose ownership is unresolved.
- Separates true shared modules from upcoming work, abandoned chains, and package-only internals.
- **Not** a backlog system — canonical task tracking stays in GitHub per repo policy.

## Classification errors in the original 2026-04-09 sweep

Per-file grep verification on 2026-04-10 revealed that the original sweep's "0/1 external consumers" rule had four blind spots:

1. **Same-package consumers not counted.** Files imported only from within `packages/pages/` were marked as 0-consumer. Example: all 7 `BrandDetail*Card.tsx` files are imported by `packages/pages/brands/components/detail-sidebar/BrandDetailSidebar.tsx`.
2. **App-side duplicate files masked emptiness.** A file copy under `apps/website/src/page-modules/` was counted as a "consumer" of the package version when it was actually a byte-identical duplicate. Example: `posts-ingredients-list.tsx` had a 141-line clone in the website app.
3. **Path-alias barrel consumption not followed.** Imports via `@pages/<feature>` barrels were not traced through to their underlying files. Example: `packages/pages/agent/agent-page-content.tsx` is consumed by 3 admin routes via `import { AgentPageContent } from '@pages/agent'`.
4. **Multi-consumer modals undercounted.** Files with 4+ real consumers (across `@ui/`, `@props/`, `@enums/`, and app routes) were marked as 1-consumer because only app-level imports were counted. Example: `ModalMember.tsx`.

## Changes in PR 1 (2026-04-10) — `feat/cleanup-to-review-1-promote-delete`

### Deleted (verified zero live consumers)

- `packages/pages/hooks/list/hooks-list.tsx` + test — only match was a CSS class string `"generated-hooks-list"` in `apps/desktop/.../ConversationView.tsx:142`, not an import
- `packages/pages/trends/shared/trend-preview-card.tsx` + test — no external references
- `packages/pages/settings/credentials/settings-credentials-page.tsx` + test — no external references
- `packages/pages/login/login-form.tsx` + test + stories — no external references
- `packages/pages/logout/logout-form.tsx` + test + stories — no external references
- `packages/pages/posts/ingredients/posts-ingredients-list.tsx` + test + stories — byte-identical duplicate exists at `apps/website/src/page-modules/posts/ingredients/posts-ingredients-list.tsx`, and the website consumes its own local copy
- `packages/pages/studio/sidebar/StudioSidebarContent.tsx` + test — only dead defensive `vi.mock` in `apps/app/packages/components/app-protected-layout.test.tsx` (removed in the same PR); `packages/pages/studio/index.ts` barrel re-export dropped

### Reclassified as live (removed from ledger, not deleted)

These were misclassified by the original sweep. All have real consumers that the sweep missed.

- `packages/pages/agent/agent-page-content.tsx` — live via `apps/app/app/(protected)/admin/agent/{page.tsx,new/page.tsx,[threadId]/page.tsx}` through the `@pages/agent` barrel
- `packages/pages/members/invite/ModalMember.tsx` — live via `packages/ui/src/components/lazy/modal/LazyModal.tsx` and `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/members/members-list.tsx` (plus referenced in `@props/modals/modal.props` and `@enums/modal.enum`)
- `packages/pages/brands/components/sidebar/BrandDetailAccountSettingsCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailExternalLinksCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailReferencesCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailSocialMediaCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailAgentProfileCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailDefaultModelsCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailIdentityCard.tsx` — live via `BrandDetailSidebar.tsx`
- `packages/pages/trends/shared/socials-navigation.tsx` — live via `apps/app/.../research/[platform]/trends-platform-detail.tsx:13`
- `packages/pages/trends/shared/trend-content-card.tsx` — live via `apps/app/.../research/[platform]/trends-platform-detail.tsx:14` + `packages/pages/trends/list/trends-list.tsx:10`

---

## Remaining entries (pending future PRs)

These still need resolution via routing, issue tracking, or per-file verification.

### Prepared features with open GitHub issues (will be wired in follow-up PRs)

_None remaining — all tracked features have been wired._

### Wired in earlier PRs (kept here as a change log)

- `packages/pages/analytics/overview/analytics-agent-dashboard.tsx` — PR 2 removed from ledger; live via dynamic import in `analytics-overview.tsx:120-126`, rendered at `:769`.
- `packages/pages/analytics/platform-detail/analytics-platform-detail.tsx` — PR 2 wired at `/analytics/brands/[id]/platforms/[platform]` (brand-scoped route; the component requires a `brandId` prop it cannot obtain from a standalone `/analytics/platforms/[platform]` URL). Drill-through links added under the Platform Comparison card in `analytics-brand-overview.tsx`.
- `packages/pages/analytics/trends/trend-detail/trend-detail.tsx` — PR 3 wired at `/analytics/trends/detail/[id]`. The existing trends list in `apps/app/.../analytics/trends/analytics-trends.tsx` was also repointed from a broken `router.push('/research/${item.id}')` (wrong: an id was being shoved into a `[platform]` slot) to the new detail route.
- `packages/pages/trends/list/components/HookRemixModal.tsx` — PR 3 wired into the viral video leaderboard on `/analytics/trends`. Clicking a video now opens the hook remix modal (falls back to the video URL only when the video is missing an id).
- `packages/pages/trends/platform-detail/trends-platform-detail.tsx` — PR 3 moved from `apps/app/.../research/[platform]/trends-platform-detail.tsx` to `packages/pages/trends/platform-detail/` so both `/research/[platform]` and the new `/analytics/trends/platforms/[platform]` route can consume the same component. `SocialsNavigation` + `TrendsPlatformDetail` now accept an optional `basePath` prop so in-surface tab navigation stays consistent ('/research' vs '/analytics/trends').
- `packages/pages/streaks/streaks-page.tsx` — PR 4 wired at `/analytics/streaks`. Added to the Analytics sidebar group in `apps/app/packages/config/menu-items.config.ts`; the corresponding `analyticsLabels` assertion in `menu-items.config.test.ts` was updated to include 'Streaks'.
- `packages/pages/mission-control/mission-control-agent-lab.tsx` — PR 4 moved to `apps/desktop/app/src/renderer/views/MissionControlView.tsx` (Epic #9 scopes mission control to the desktop app; the existing `menu-items.config.test.ts` assertion that `/mission-control` is NOT in the web APP_MENU_ITEMS stays valid). The default export was renamed from `MissionControlAgentLabPage` to a named export `MissionControlView` to match the desktop view convention (`AgentsView`, `AnalyticsView`, etc.). Wired into `apps/desktop/app/src/renderer/nav-view.ts`, `App.tsx` (new `'mission-control'` case), and `Sidebar.tsx` (new NAV_ITEMS entry). The `packages/pages/mission-control/` directory was deleted entirely.

### Studio subtree (reachable via StudioGenerateLayout, not orphaned)

These files were misclassified by the sweep because the dependency chain from `apps/app/.../studio/[type]/StudioPageContent.tsx:9` (`import StudioGenerateLayout from '@pages/studio/generate'`) wasn't traced. They are internal children of `StudioGenerateLayout`, not dead code. A follow-up PR can either remove them from this ledger with a "live, internal to StudioGenerateLayout" annotation or audit the `packages/pages/studio/index.ts` barrel for dead re-exports (the barrel exports many files that are only consumed internally).

- `packages/pages/studio/canvas/StudioCanvas.tsx`
- `packages/pages/studio/constants/prompt-bar.constants.tsx`
- `packages/pages/studio/edit-topbar/StudioEditTopbar.tsx`
- `packages/pages/studio/gallery/CanvasGallery.tsx`
- `packages/pages/studio/generate/components/AssetControlsHeader.tsx`
- `packages/pages/studio/generate/components/AssetDisplayGrid.tsx`
- `packages/pages/studio/generate/components/StudioComposer.tsx`
- `packages/pages/studio/generate/hooks/useAssetActions.ts`
- `packages/pages/studio/generate/hooks/useAssetLoading.ts`
- `packages/pages/studio/generate/hooks/useFilters.ts`
- `packages/pages/studio/generate/hooks/usePromptState.ts`
- `packages/pages/studio/generate/hooks/useSocketGeneration.ts`
- `packages/pages/studio/generate/hooks/useTableColumns.tsx`
- `packages/pages/studio/generate/hooks/useTableSelection.ts`
- `packages/pages/studio/generate/hooks/useViewMode.ts`
- `packages/pages/studio/generate/StudioGenerateLayout.tsx`
- `packages/pages/studio/generate/types.ts`
- `packages/pages/studio/generate/utils/generation-payloads.ts`
- `packages/pages/studio/generate/utils/helpers.ts`
- `packages/pages/studio/mask-editor/MaskEditor.tsx`
- `packages/pages/studio/page/StudioPage.tsx`
- `packages/pages/studio/prompt-bars/PromptBarsImageMerge.tsx`
- `packages/pages/studio/prompt-bars/PromptBarsVideoMerge.tsx`
- `packages/pages/studio/prompt-bars/PromptSuggestions.tsx`
- `packages/pages/studio/queue/GenerationQueue.tsx`
- `packages/pages/studio/selection/StudioSelectionActionsBar.tsx`

### Untracked WIP (needs GitHub issue per PR 5)

These were iterated in the last week but have no open GitHub issue. Per user decision, they get an issue opened rather than deletion.

- `packages/pages/twitter-pipeline/twitter-pipeline-engage.tsx`
- `packages/pages/twitter-pipeline/components/opportunity-card.tsx`
- `packages/pages/twitter-pipeline/components/tweet-card.tsx`
- `packages/pages/agents/campaigns/AgentCampaignDetailPage.tsx`
- `packages/pages/agents/campaigns/AgentCampaignNewPage.tsx`
- `packages/pages/agents/campaigns/AgentCampaignsPage.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignDetail.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignsList.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignWizard.tsx`
- `packages/pages/agents/tasks/CronJobsList.tsx`
- `packages/pages/calendar/posts/posts-calendar-page.tsx`
- `packages/pages/articles/list/articles-list.tsx`
- `packages/pages/calendar/articles/articles-calendar-page.tsx`
- `packages/pages/library/landing/library-landing-visual-preview.tsx`

### Posts subtree (needs per-file verification)

Deferred from PR 1 because the original sweep is untrustworthy and each file needs an individual consumer grep before action.

- `packages/pages/posts/[id]/ingredient-posts.tsx`
- `packages/pages/posts/detail/components/PostDetailAnalytics.tsx`
- `packages/pages/posts/detail/components/PostDetailCard.tsx`
- `packages/pages/posts/detail/components/PostDetailContent.tsx`
- `packages/pages/posts/detail/components/PostDetailHeader.tsx`
- `packages/pages/posts/list/components/PostsGrid.tsx`
- `packages/pages/posts/list/components/PostsListToolbar.tsx`

## Notes

- Canonical task tracking stays in GitHub, per repo policy.
- Do not use this file as a backlog — it is a preservation ledger only.
- Every remaining entry should either land in a follow-up PR or gain a `GitHub Issue: #N` annotation during PR 5.
