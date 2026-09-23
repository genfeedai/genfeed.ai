packages: ui props

Add optional isLoading and loadingLabel props to Card and WorkspaceSurface. A
loading card displays one flat skeleton inside its frame; static cards keep their
existing behavior. Card keeps its body mounted but hidden and inert while loading.
Pass initial data loading rather than background refresh state to retain content.

MetricCard tiles now use the whole-card loading state. SkeletonCard supports an
accessible label and test id, and renders one silhouette instead of nested image,
text and action placeholders; the existing show flags only determine its footprint.

Add cancellable useNavigationIntentPrefetch handlers for hover/focus warming.
Shared navigation prefetch uses automatic prefetching and clears its deduplication
entry when Next invalidates the route.
