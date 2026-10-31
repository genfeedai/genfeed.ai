import type { useWorkflowStore } from '@genfeedai/workflows/ui/stores';

const TRANSIENT_NODE_FIELDS = new Set([
  'selected',
  'dragging',
  'measured',
  'resizing',
  'width',
  'height',
]);
const TRANSIENT_NODE_DATA = new Set(['status', 'progress', 'error', 'jobId']);

export function getCloudWorkflowSnapshot(
  state: ReturnType<typeof useWorkflowStore.getState>,
) {
  return {
    edgeStyle: state.edgeStyle,
    edges: state.edges.map(({ selected: _selected, ...edge }) => edge),
    groups: state.groups,
    nodes: state.nodes.map((node) => ({
      ...Object.fromEntries(
        Object.entries(node).filter(([key]) => !TRANSIENT_NODE_FIELDS.has(key)),
      ),
      data: Object.fromEntries(
        Object.entries(node.data).filter(
          ([key]) => !TRANSIENT_NODE_DATA.has(key),
        ),
      ),
      id: node.id,
      position: node.position,
      type: node.type,
    })),
    workflowName: state.workflowName,
  };
}

export function selectCloudWorkflowEditKey(
  state: ReturnType<typeof useWorkflowStore.getState>,
): string {
  return JSON.stringify(getCloudWorkflowSnapshot(state));
}
