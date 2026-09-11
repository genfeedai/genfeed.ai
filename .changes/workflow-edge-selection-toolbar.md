packages: @genfeedai/workflows

Remove the standalone `EdgeToolbar` component from `./ui` and `./ui/canvas` —
the edge delete/pause toolbar is now rendered per-edge inside `EditableEdge`
via `EdgeLabelRenderer`, anchored at the edge's own computed midpoint instead
of estimating a position from node centers. Add `isEventFromHandle` to
`./ui/lib`, a small helper used to keep clicks that start or end on a
connection handle from also selecting the node underneath.

Consumers that imported `EdgeToolbar` from `@genfeedai/workflows/ui` (or
`@genfeedai/workflows/ui/canvas`) must drop that import — `WorkflowCanvas`
mounts the replacement automatically and needs no wiring.
