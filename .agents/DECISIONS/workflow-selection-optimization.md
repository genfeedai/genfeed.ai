# Workflow Editor Optimization Decisions

## Context
The repo audit found two workflow-editor hotspot classes in both `packages/workflow-ui` and `apps/app`:
- repeated `Array.includes` scans over selected node IDs in render and action paths
- repeated `nodes.find(...)` and `edges.filter(...)` scans inside graph helpers, validation hooks, and traversal code

## Options Considered
1. Keep the current array-based shape and patch each hotspot inline.
2. Store a `Set` in Zustand alongside `selectedNodeIds`.
3. Add shared lookup helpers in `@genfeedai/workflow-ui/lib` and reuse them from both implementations.

## Decision
Choose option 3.

## Why
- It removes repeated O(n*m) membership scans in hot paths without changing store shape or public APIs.
- It improves DRY by giving the app shell and shared workflow package one canonical selection/group/graph utility layer.
- It stays low risk because the data flow remains array-based at the store boundary.

## Additional Decisions
- Precompute `Map` lookups inside traversal-heavy helpers like upstream graph walks and connected-input collection, where repeated scans would otherwise compound.
- Keep single-lookup cases as direct `.find(...)` calls when a local `Map` would only add allocation cost without reducing repeated work.
- Prefer documenting blocked verification as an external workspace issue instead of stretching the optimization scope to unrelated packages.

## Non-Goals
- Re-architecting the workflow stores
- Broad repo-wide memoization changes without evidence
- Touching files already modified elsewhere in the worktree
