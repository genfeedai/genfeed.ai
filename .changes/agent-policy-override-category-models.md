packages: @genfeedai/props

`OverrideCategoryModels` (generation/review/thinking scoped enabled-model
lists for the agent policy settings page) moved from an inline route-file
type into `packages/props/settings/policy.props.ts`, alongside the other
policy-page prop types. `AdvancedRoutingCardProps`
(`packages/props/settings/model-routing.props.ts`) gained four new required
fields:

- `generationModelOverrideUnresolvedKey`, `reviewModelOverrideUnresolvedKey`,
  `thinkingModelOverrideUnresolvedKey: string | null` — so the card can show a
  stored override that no longer matches an enabled model as an explicit
  "unresolved" state instead of silently falling back to Auto.
- `isModelCatalogLoading: boolean` — so each picker shows a loading skeleton
  instead of Auto while the model catalog query is still pending (a stored
  override can't yet be told apart from unset without it).

The same file also gained a new exported type, `ModelOverridePickerProps`,
for the card's shared internal per-field picker component.
