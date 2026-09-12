packages: @genfeedai/props

Add optional `routeBrandId?: string` to `RestoredAnalyticsSurfaceState`
(`./analytics/analytics-work-surface-state.props`).

Carries the brand id parsed from `/analytics/brands/:id` and its
`/platforms/:platform` child, independent of `selectedResource`, so the
analytics work-surface adapter can scope the inspector and rebind the open
thread to the route's brand. Existing consumers of
`RestoredAnalyticsSurfaceState` keep compiling unchanged; the field is
optional and absent on every other analytics route.
