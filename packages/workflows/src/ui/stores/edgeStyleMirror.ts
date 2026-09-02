import type { EdgeStyle } from '@genfeedai/contracts/types';

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
 *
 * The preference slot is the hydration path: settings writes the persisted
 * value on load, the workflow store reads it for its initial `edgeStyle`, and
 * `loadWorkflow` / `loadWorkflowById` fall back to it when a saved graph has
 * no style of its own. Live toggles still go through the mirror callback.
 */
type EdgeStyleMirror = (style: EdgeStyle) => void;

const DEFAULT_EDGE_STYLE: EdgeStyle = 'default';
const NOOP_EDGE_STYLE_MIRROR: EdgeStyleMirror = () => {};

let _mirror: EdgeStyleMirror = NOOP_EDGE_STYLE_MIRROR;
let _preference: EdgeStyle = DEFAULT_EDGE_STYLE;

/**
 * Register the canvas-side mirror. The workflow store calls this as it loads;
 * passing `undefined` resets to the no-op default.
 *
 * The no-op is the correct standalone behaviour: with no graph loaded there is
 * nothing to restyle. The live graph still hydrates from
 * {@link getEdgeStylePreference} rather than a hardcoded `'default'`.
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

/** Persist the current user preference for graph hydration (not a live restyle). */
export function setEdgeStylePreference(style: EdgeStyle): void {
  _preference = style;
}

/** Preference used when a workflow record has no `edgeStyle` of its own. */
export function getEdgeStylePreference(): EdgeStyle {
  return _preference;
}

export function hasRecordEdgeStyle(
  recordStyle: string | null | undefined,
): recordStyle is string {
  return typeof recordStyle === 'string' && recordStyle.length > 0;
}

/**
 * Record style wins when present; otherwise the saved user preference
 * (falling back to `'default'` when no preference has been registered).
 */
export function resolveGraphEdgeStyle(
  recordStyle: string | null | undefined,
): EdgeStyle {
  return hasRecordEdgeStyle(recordStyle)
    ? (recordStyle as EdgeStyle)
    : _preference;
}
