// Studio page modules — barrel export.
//
// Only `StudioGenerateLayout` is consumed externally today, from
// `apps/app/app/(protected)/[orgSlug]/[brandSlug]/studio/[type]/StudioPageContent.tsx`.
// `StudioSelectionActionsBar` stays because `StudioGenerateLayout` imports it.
//
// Nine dead re-exports (StudioCanvas, StudioEditTopbar, CanvasGallery,
// MaskEditor, StudioPage, PromptBars{Image,Video}Merge, PromptSuggestions,
// GenerationQueue) were removed along with their source + test files in the
// 2026-04-11 Phase D cleanup. See `packages/pages/TO_REVIEW.md` history.

export { StudioGenerateLayout } from '@pages/studio/generate';
export { default as StudioSelectionActionsBar } from '@pages/studio/selection/StudioSelectionActionsBar';
