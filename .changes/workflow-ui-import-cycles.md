packages: @genfeedai/workflows @genfeedai/contexts

Break the import cycles `check:import-cycles` reports, so the check can gate CI.

- `workflows`: `ExecutionStore` drops `estimatedCost` and `setEstimatedCost`.
  Nothing read the value; cost displays derive it from nodes with
  `calculateWorkflowCost`. `ReferencableWorkflow`, `WorkflowRefApi`,
  `DefaultModelSettings`, and `RecentModel` are declared in `ui/provider/types`;
  the `ui/nodes` and `ui/stores` exports keep the same names.
- `contexts`: `global-modals.provider` no longer re-exports `GallerySelectItem`
  (import it from `@genfeedai/props/modals/modal-gallery.props`), and
  `DEFAULT_BRAND_CONTEXT` is private to `brand-context`.
