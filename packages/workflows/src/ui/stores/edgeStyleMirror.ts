import type { EdgeStyle } from '@genfeedai/types';

// =============================================================================
// Module-level edge-style mirror
// =============================================================================

/**
 * Pushes an edge-style preference into the live graph.
 *
 * The workflow store keeps its own `edgeStyle` so open edges restyle when the
 * preference changes, so a settings change has to reach it. Neither store can
 * import the other: the workflow store pulls in the execution store, which
 * reads the settings store back for `debugMode`, and closing that loop in
 * either direction creates a cycle. This registry sits outside both of them,
 * the same way `applyEditOperations` and `workflowPersistence` do.
 */
type EdgeStyleMirror = (style: EdgeStyle) => void;

const NOOP_EDGE_STYLE_MIRROR: EdgeStyleMirror = () => {};

let _mirror: EdgeStyleMirror = NOOP_EDGE_STYLE_MIRROR;

/**
 * Register the canvas-side mirror. The workflow store calls this as it loads;
 * passing `undefined` resets to the no-op default.
 *
 * The no-op is the correct standalone behaviour: with no graph loaded there is
 * nothing to restyle, and the workflow store starts from its own default.
 */
export function configureEdgeStyleMirror(
  mirror: EdgeStyleMirror | undefined,
): void {
  _mirror = mirror ?? NOOP_EDGE_STYLE_MIRROR;
}

/** Read the currently-registered mirror (a no-op until the graph loads). */
export function getEdgeStyleMirror(): EdgeStyleMirror {
  return _mirror;
}
