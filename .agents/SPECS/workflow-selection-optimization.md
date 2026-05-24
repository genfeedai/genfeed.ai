# Workflow Editor Optimization Spec

## Purpose
Reduce workflow-editor hot-path work by replacing repeated linear membership scans and repeated graph lookup scans with shared helpers reused by both `packages/workflow-ui` and `apps/app`.

## Non-Goals
- Backend or database optimization
- General bundle-size work
- UI behavior changes

## Interfaces
- Add shared selection helpers in `packages/workflow-ui/src/lib/selection.ts`
- Add shared graph lookup helpers in `packages/workflow-ui/src/lib/lookups.ts`, `graph.ts`, and `nodeOutputs.ts`
- Export them through `@genfeedai/workflow-ui/lib`
- Reuse them in workflow canvas, multi-select toolbar, context-menu hooks, keyboard shortcuts, workflow store slices, persistence helpers, and validation hooks

## Key Decisions
- Keep `selectedNodeIds` as arrays at the store boundary
- Build `Set` or `Map` lookups only where membership checks or graph traversals are repeated enough to justify the setup cost
- Reuse the same helper surface from the app shell instead of duplicating app-local utilities
- Do not keep map-backed rewrites for one-off lookups where a single `.find(...)` is cheaper and clearer

## Edge Cases and Failure Modes
- Empty selections must remain cheap and return stable empty results
- Group operations must preserve ordering when merging IDs
- Removing IDs from groups must not remove unrelated node IDs
- Connected-input aggregation must preserve multi-value handles
- Upstream traversal must not loop on already-visited nodes
- Missing source nodes or missing handles must stay non-fatal

## Acceptance Criteria
- Shared workflow package and app shell both consume the same selection and graph lookup helpers
- Selection, grouping, locking, keyboard shortcut, persistence, and graph traversal paths stop doing repeated `includes` or repeated target-scan `filter/find` work in the touched hotspots
- Helper behavior is covered by focused unit tests
- Touched files pass formatter/lint sanity and targeted helper tests
- Verification notes clearly separate repo-local regressions from unrelated pre-existing workspace failures

## Test Plan
- Add unit tests for the new selection helpers
- Add unit tests for the new graph and output helpers
- Run the workflow-ui package tests for the helper files
- Run formatter/lint sanity on touched files
- Run targeted type-checks for `@genfeedai/workflow-ui` and `@genfeedai/app` when upstream workspace dependencies allow it

## Session Outcome (2026-04-24)
- Added shared selection/group helpers and reused them in canvas, multi-select, context-menu, keyboard shortcut, grouping, and locking paths across the shared package and app shell
- Added shared lookup and graph helpers and reused them in propagation, persistence, edge validation, node duplication, and generate-validation paths
- Added focused tests for `selection`, `lookups`, `nodeOutputs`, and `graph`
- Confirmed `biome` and targeted helper tests pass
- Left full turbo type-check partially blocked by unrelated `@genfeedai/ui` errors in `packages/ui/src/primitives/button.tsx`
