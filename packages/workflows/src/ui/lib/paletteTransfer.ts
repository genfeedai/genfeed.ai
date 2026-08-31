export const WORKFLOW_NODE_TRANSFER_TYPE =
  'application/vnd.genfeed.workflow-node+json';

export interface WorkflowNodeTransferPayload {
  actionId?: string;
  label: string;
  type: string;
  version: 1;
}

export function encodeWorkflowNodeTransfer(
  payload: Omit<WorkflowNodeTransferPayload, 'version'>,
): string {
  return JSON.stringify({ ...payload, version: 1 });
}

export function decodeWorkflowNodeTransfer(
  value: string,
): WorkflowNodeTransferPayload | null {
  if (!value) return null;

  try {
    const candidate = JSON.parse(value) as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      typeof candidate.type !== 'string' ||
      candidate.type.length === 0 ||
      typeof candidate.label !== 'string' ||
      candidate.label.length === 0 ||
      (candidate.actionId !== undefined &&
        (typeof candidate.actionId !== 'string' ||
          candidate.actionId.length === 0))
    ) {
      return null;
    }

    return {
      ...(typeof candidate.actionId === 'string'
        ? { actionId: candidate.actionId }
        : {}),
      label: candidate.label,
      type: candidate.type,
      version: 1,
    };
  } catch {
    return null;
  }
}
