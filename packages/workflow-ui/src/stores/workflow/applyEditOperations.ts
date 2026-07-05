import type { ApplyEditOperations } from './slices/types';

// =============================================================================
// Module-level applyEditOperations configuration
// =============================================================================

/**
 * Injected `applyEditOperations` implementation for the snapshot slice (used by
 * the chat/agent edit pipeline to mutate the graph). Registered at module scope
 * via {@link configureApplyEditOperations} because the workflow store lives
 * outside the React tree.
 *
 * Defaults to a no-op that leaves the graph untouched (0 applied) so the package
 * stays functional standalone; the consuming app injects the real graph-diffing
 * implementation through `WorkflowUIConfig.applyEditOperations`.
 */
const NOOP_APPLY_EDIT_OPERATIONS: ApplyEditOperations = (
  _operations,
  state,
) => ({
  applied: 0,
  edges: state.edges,
  nodes: state.nodes,
  skipped: [],
});

let _apply: ApplyEditOperations = NOOP_APPLY_EDIT_OPERATIONS;

/**
 * Register the `applyEditOperations` implementation the snapshot slice uses.
 * Called by WorkflowUIProvider; resets to the no-op default when unset.
 */
export function configureApplyEditOperations(
  apply: ApplyEditOperations | undefined,
): void {
  _apply = apply ?? NOOP_APPLY_EDIT_OPERATIONS;
}

/** Read the currently-configured applyEditOperations (no-op until configured). */
export function getApplyEditOperations(): ApplyEditOperations {
  return _apply;
}
