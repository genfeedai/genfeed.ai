packages: @genfeedai/interfaces @genfeedai/agent @genfeedai/serializers @genfeedai/tools @genfeedai/constants @genfeedai/client @genfeedai/services @genfeedai/prisma

Persist per-brand OpenUI dashboard layouts (phase 1). Chat-generated
`render_dashboard` blocks can now be saved to a `DashboardLayout` record and
rendered on the workspace overview page.

New public surface:
- `@genfeedai/interfaces`: `sourceKey`/`sourceParams` on dashboard blocks
  (`AgentBlockSourceParams`), `PersistedDashboardLayoutDocument`,
  `IDashboardLayout`, and the `save_dashboard_layout`/`get_dashboard_layout`
  `AgentToolName` members.
- `@genfeedai/agent` (`/dashboard`): `hydrateLayout`,
  `sanitizeLayoutForPersistence`, `isResolvableSourceKey`,
  `DashboardHydrationData`. Persisted layouts are snapshot-free — data-bearing
  blocks reference a live analytics `sourceKey` hydrated at render time.
- `@genfeedai/serializers`: `DashboardLayoutSerializer`.
- `@genfeedai/tools`: `AGENT_DASHBOARD_LAYOUT_TOOLS`.
- `@genfeedai/constants`: `API_ENDPOINTS.DASHBOARD_LAYOUTS`.
- `@genfeedai/client` / `@genfeedai/services`: `DashboardLayout` model and
  `DashboardLayoutsService`.
- `@genfeedai/prisma`: `DashboardLayout` model.
