import type { NodeGroup, WorkflowEdge, WorkflowNode } from '@genfeedai/types';

interface TemporalState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: NodeGroup[];
}

/**
 * Shallow equality check for temporal state.
 * Optimized for the specific shape of workflow state to avoid expensive JSON.stringify.
 *
 * Checks:
 * 1. Array length equality (fast early exit)
 * 2. Reference equality for arrays (no change)
 * 3. Individual item id + key property comparisons
 */
export function temporalStateEquals(a: TemporalState, b: TemporalState): boolean {
  // Reference equality (same object)
  if (a === b) return true;

  // Check nodes
  if (!arraysShallowEqual(a.nodes, b.nodes, nodeEquals)) return false;

  // Check edges
  if (!arraysShallowEqual(a.edges, b.edges, edgeEquals)) return false;

  // Check groups
  if (!arraysShallowEqual(a.groups, b.groups, groupEquals)) return false;

  return true;
}

/**
 * Compare two arrays using a custom equality function for items.
 * Returns true if arrays have same length and all items are equal.
 */
function arraysShallowEqual<T>(a: T[], b: T[], itemEquals: (a: T, b: T) => boolean): boolean {
  // Reference equality
  if (a === b) return true;

  // Length check (fast exit)
  if (a.length !== b.length) return false;

  // Check each item
  for (let i = 0; i < a.length; i++) {
    if (!itemEquals(a[i], b[i])) return false;
  }

  return true;
}

/**
 * Compare two nodes for equality.
 * Checks id, type, position, and key data properties.
 */
function nodeEquals(a: WorkflowNode, b: WorkflowNode): boolean {
  if (a === b) return true;

  // Basic properties
  if (a.id !== b.id) return false;
  if (a.type !== b.type) return false;

  // Position
  if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;

  // Dimensions (if set)
  if (a.width !== b.width || a.height !== b.height) return false;

  // Data comparison - compare key fields that affect undo/redo
  const aData = a.data as Record<string, unknown>;
  const bData = b.data as Record<string, unknown>;

  // Compare status and outputs (the main things that change)
  if (aData.status !== bData.status) return false;
  if (aData.outputImage !== bData.outputImage) return false;
  if (aData.outputVideo !== bData.outputVideo) return false;
  if (aData.outputText !== bData.outputText) return false;
  if (aData.outputAudio !== bData.outputAudio) return false;

  // Compare input fields
  if (aData.prompt !== bData.prompt) return false;
  if (aData.image !== bData.image) return false;
  if (aData.video !== bData.video) return false;
  if (aData.audio !== bData.audio) return false;
  if (aData.inputPrompt !== bData.inputPrompt) return false;
  if (aData.inputImage !== bData.inputImage) return false;
  if (aData.inputVideo !== bData.inputVideo) return false;
  if (aData.inputAudio !== bData.inputAudio) return false;
  if (aData.inputText !== bData.inputText) return false;

  // Compare model selection
  if (aData.model !== bData.model) return false;

  // Schema params need JSON comparison (complex objects)
  if (aData.schemaParams !== bData.schemaParams) {
    if (JSON.stringify(aData.schemaParams) !== JSON.stringify(bData.schemaParams)) {
      return false;
    }
  }

  return true;
}

/**
 * Compare two edges for equality.
 */
function edgeEquals(a: WorkflowEdge, b: WorkflowEdge): boolean {
  if (a === b) return true;

  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle
  );
}

/**
 * Compare two groups for equality.
 */
function groupEquals(a: NodeGroup, b: NodeGroup): boolean {
  if (a === b) return true;

  if (a.id !== b.id) return false;
  if (a.name !== b.name) return false;
  if (a.color !== b.color) return false;

  // Compare nodeIds array
  if (a.nodeIds.length !== b.nodeIds.length) return false;
  for (let i = 0; i < a.nodeIds.length; i++) {
    if (a.nodeIds[i] !== b.nodeIds[i]) return false;
  }

  return true;
}
