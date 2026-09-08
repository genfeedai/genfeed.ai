import { getActionDefinition } from '@genfeedai/actions';
import type { WorkflowCardPreviewProps } from '@genfeedai/props/workflows/workflow-card-preview.props';
import { getLayoutedNodes } from '@genfeedai/workflows/ui/lib';

export const PREVIEW_NODE_WIDTH = 180;
export const PREVIEW_NODE_HEIGHT = 64;

export function buildWorkflowPreview({
  nodes = [],
  edges = [],
}: Pick<WorkflowCardPreviewProps, 'nodes' | 'edges'>) {
  const uniqueNodes = [
    ...new Map(
      nodes
        .filter((node) => node.type !== 'group')
        .map((node) => [node.id, node]),
    ).values(),
  ];
  const ids = new Set(uniqueNodes.map((node) => node.id));
  const validEdges = edges.filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );
  const layout = getLayoutedNodes(
    uniqueNodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.data ?? {},
      position: { x: 0, y: 0 },
      measured: { width: PREVIEW_NODE_WIDTH, height: PREVIEW_NODE_HEIGHT },
    })),
    validEdges.map((edge, index) => ({
      ...edge,
      id: edge.id ?? `preview-edge-${index}`,
    })),
    { direction: 'LR', nodeSpacing: 48, rankSpacing: 72 },
  );
  const positioned = layout.map((node) => {
    const config =
      node.data.config &&
      typeof node.data.config === 'object' &&
      'actionId' in node.data.config
        ? node.data.config
        : undefined;
    const actionId =
      typeof node.data.actionId === 'string'
        ? node.data.actionId
        : typeof config?.actionId === 'string'
          ? config.actionId
          : node.type;
    const action = actionId ? getActionDefinition(actionId) : undefined;
    const label =
      typeof node.data.label === 'string' && node.data.label
        ? node.data.label
        : (action?.label ?? node.type ?? 'Step');
    return {
      id: node.id,
      ...node.position,
      label,
      category: action?.workflowCategory ?? 'processing',
    };
  });
  const byId = new Map(positioned.map((node) => [node.id, node]));
  return {
    nodes: positioned,
    edges: validEdges.flatMap((edge, index) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      return source && target
        ? [{ id: edge.id ?? `preview-edge-${index}`, source, target }]
        : [];
    }),
    width: Math.max(
      320,
      ...positioned.map((node) => node.x + PREVIEW_NODE_WIDTH + 50),
    ),
    height: Math.max(
      180,
      ...positioned.map((node) => node.y + PREVIEW_NODE_HEIGHT + 50),
    ),
  };
}
