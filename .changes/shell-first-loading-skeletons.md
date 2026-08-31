packages: @genfeedai/ui @genfeedai/props

Remove the route-level fake-skeleton loading surface. The product app now
renders page shells immediately and keeps loading states inside data regions,
so the full-page skeleton fallbacks lost their last importers.

Removed public surface:
- `@genfeedai/ui`: `SkeletonLoadingFallback` (loading/skeleton/SkeletonFallbacks),
  `SkeletonVideoGrid`, `SkeletonBrandsList`, `SkeletonAnalyticsDashboard`
  (display/skeleton/skeleton), and the unused `components/skeletons/` directory
  (`SkeletonMarketplace`, `SkeletonStudio`).
- `@genfeedai/props`: `SkeletonLoadingProps`, `SkeletonType`
  (ui/feedback/skeleton-loading.props), and `SkeletonVideoGridProps`
  (ui/feedback/skeleton.props).

Consumers use `PageLoadingState` for guard-level loading and in-region
primitives (`SkeletonTable`, `SkeletonCard`, `Spinner`) inside data blocks.
