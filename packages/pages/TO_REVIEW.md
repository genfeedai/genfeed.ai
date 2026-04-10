# `packages/pages` TO REVIEW

Generated during the final ownership sweep on 2026-04-09.

Purpose:
- preserve unowned or package-internal page modules without deleting them
- make it explicit that these files are not validated active shared surfaces
- separate true shared modules from upcoming work / abandoned chains / package-only internals

Rule used for this pass:
- `0` external runtime consumers: `TO REVIEW`
- `1` external runtime consumer with unresolved package-internal coupling: `TO REVIEW`

These files should not be treated as validated shared page APIs until they are either:
- adopted by a real owner and moved into that owner slice, or
- revalidated as genuinely shared, or
- intentionally removed in a later cleanup

## Zero External Runtime Consumers

- `packages/pages/agent/agent-page-content.tsx`
- `packages/pages/agents/campaigns/AgentCampaignDetailPage.tsx`
- `packages/pages/agents/campaigns/AgentCampaignNewPage.tsx`
- `packages/pages/agents/campaigns/AgentCampaignsPage.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignDetail.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignsList.tsx`
- `packages/pages/agents/campaigns/OutreachCampaignWizard.tsx`
- `packages/pages/agents/tasks/CronJobsList.tsx`
- `packages/pages/analytics/overview/analytics-agent-dashboard.tsx`
- `packages/pages/analytics/platform-detail/analytics-platform-detail.tsx`
- `packages/pages/analytics/trends/trend-detail/trend-detail.tsx`
- `packages/pages/articles/list/articles-list.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailAccountSettingsCard.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailExternalLinksCard.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailReferencesCard.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailSocialMediaCard.tsx`
- `packages/pages/calendar/articles/articles-calendar-page.tsx`
- `packages/pages/calendar/posts/posts-calendar-page.tsx`
- `packages/pages/hooks/list/hooks-list.tsx`
- `packages/pages/library/landing/library-landing-visual-preview.tsx`
- `packages/pages/login/login-form.tsx`
- `packages/pages/logout/logout-form.tsx`
- `packages/pages/mission-control/mission-control-agent-lab.tsx`
- `packages/pages/posts/[id]/ingredient-posts.tsx`
- `packages/pages/posts/detail/components/PostDetailAnalytics.tsx`
- `packages/pages/posts/detail/components/PostDetailCard.tsx`
- `packages/pages/posts/detail/components/PostDetailContent.tsx`
- `packages/pages/posts/detail/components/PostDetailHeader.tsx`
- `packages/pages/posts/list/components/PostsGrid.tsx`
- `packages/pages/posts/list/components/PostsListToolbar.tsx`
- `packages/pages/settings/credentials/settings-credentials-page.tsx`
- `packages/pages/streaks/streaks-page.tsx`
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
- `packages/pages/studio/sidebar/StudioSidebarContent.tsx`
- `packages/pages/trends/list/components/HookRemixModal.tsx`
- `packages/pages/trends/shared/trend-preview-card.tsx`
- `packages/pages/twitter-pipeline/components/opportunity-card.tsx`
- `packages/pages/twitter-pipeline/components/tweet-card.tsx`
- `packages/pages/twitter-pipeline/twitter-pipeline-engage.tsx`

## One External Runtime Consumer, Still Needs Ownership Review

- `packages/pages/brands/components/sidebar/BrandDetailAgentProfileCard.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailDefaultModelsCard.tsx`
- `packages/pages/brands/components/sidebar/BrandDetailIdentityCard.tsx`
- `packages/pages/members/invite/ModalMember.tsx`
- `packages/pages/posts/ingredients/posts-ingredients-list.tsx`
- `packages/pages/trends/shared/socials-navigation.tsx`
- `packages/pages/trends/shared/trend-content-card.tsx`

## Notes

- Review and studio editor route ownership was normalized in this pass; stale package barrel exports were removed.
- The list above is a preservation ledger, not a backlog system.
- Canonical task tracking stays in GitHub, per repo policy.
