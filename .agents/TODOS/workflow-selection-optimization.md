# Workflow Editor Optimization TODO

## Completed (2026-04-24)

- [x] Add shared selection/group lookup helpers in `packages/workflow-ui/src/lib`
  Verify: `bun --cwd packages/workflow-ui test src/lib/selection.test.ts`

- [x] Refactor shared workflow-ui canvas, toolbar, shortcuts, and store slices to use the helpers
  Verify: `bun --cwd packages/workflow-ui test src/lib/selection.test.ts`

- [x] Refactor app workflow canvas and context-menu/store slices to reuse the shared helpers
  Verify: earlier targeted workflow-ui/app type-check passed during the first optimization pass

- [x] Add shared graph lookup helpers in `packages/workflow-ui/src/lib/lookups.ts`, `graph.ts`, and `nodeOutputs.ts`
  Verify: `bun --cwd packages/workflow-ui test src/lib/lookups.test.ts src/lib/nodeOutputs.test.ts src/lib/graph.test.ts`

- [x] Refactor shared and app workflow persistence, edge, node, and validation paths to reuse the shared graph helpers
  Verify: `bunx biome check` on touched files and helper tests passed

- [x] Document the verification boundary for this session
  Result: targeted helper tests and `biome` passed; turbo type-check currently fails outside this work in `packages/ui/src/primitives/button.tsx`

## Blocked / External

- [ ] Run full targeted turbo type-check for workflow-ui/app without unrelated workspace failures
  Blocker: `packages/ui/src/primitives/button.tsx:121` and `packages/ui/src/primitives/button.tsx:289` fail with `TS2538: Type 'null' cannot be used as an index type`

## Next Candidate Pass

- [ ] DRY and optimize duplicated clipboard/action logic in `packages/workflow-ui/src/hooks/useNodeActions.ts` and `apps/app/src/hooks/useNodeActions.ts`
  Why: the package and app copies still duplicate selection-copy-cut logic and still rescan nodes/edges per action
