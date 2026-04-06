import { ReviewGateStatus, WorkflowNodeStatus } from '@genfeedai/enums';
import type {
  ExecutionNodeResult,
  ExecutionResult,
} from '@/features/workflows/services/workflow-api';

export interface ExecutionNodePatch {
  nodeId: string;
  patch: Record<string, unknown>;
}

function mapExecutionStatusToNodeStatus(status: string): WorkflowNodeStatus {
  switch (status) {
    case 'completed':
      return WorkflowNodeStatus.COMPLETE;
    case 'failed':
      return WorkflowNodeStatus.ERROR;
    case 'running':
      return WorkflowNodeStatus.PROCESSING;
    case 'pending':
    case 'skipped':
    default:
      return WorkflowNodeStatus.IDLE;
  }
}

function coerceReviewGateStatus(value: unknown): ReviewGateStatus | null {
  switch (value) {
    case ReviewGateStatus.APPROVED:
      return ReviewGateStatus.APPROVED;
    case ReviewGateStatus.REJECTED:
      return ReviewGateStatus.REJECTED;
    case ReviewGateStatus.TIMEOUT:
      return ReviewGateStatus.TIMEOUT;
    case ReviewGateStatus.PENDING:
      return ReviewGateStatus.PENDING;
    default:
      return null;
  }
}

function inferReviewMediaType(
  inputMedia: string | null,
): 'image' | 'video' | 'text' | null {
  if (!inputMedia) {
    return null;
  }

  const normalized = inputMedia.split('?')[0]?.toLowerCase() ?? inputMedia;
  if (/\.(mp4|mov|webm|m4v)$/u.test(normalized)) {
    return 'video';
  }

  if (/\.(png|jpe?g|gif|webp|avif|svg)$/u.test(normalized)) {
    return 'image';
  }

  return null;
}

export function buildExecutionNodePatch(
  nodeResult: ExecutionNodeResult,
): ExecutionNodePatch | null {
  const patch: Record<string, unknown> = {
    error: nodeResult.error,
    status: mapExecutionStatusToNodeStatus(nodeResult.status),
  };

  if (
    nodeResult.nodeType === 'reviewGate' &&
    nodeResult.output &&
    typeof nodeResult.output === 'object'
  ) {
    const output = nodeResult.output as Record<string, unknown>;
    const approvalStatus =
      coerceReviewGateStatus(output.approvalStatus) ?? ReviewGateStatus.PENDING;
    const inputMedia =
      typeof output.inputMedia === 'string' ? output.inputMedia : null;
    const inputCaption =
      typeof output.inputCaption === 'string' ? output.inputCaption : null;
    const outputMedia =
      typeof output.outputMedia === 'string' ? output.outputMedia : inputMedia;
    const outputCaption =
      typeof output.outputCaption === 'string'
        ? output.outputCaption
        : inputCaption;
    const rejectionReason =
      typeof output.rejectionReason === 'string'
        ? output.rejectionReason
        : undefined;

    patch.approvalId =
      typeof output.approvalId === 'string' ? output.approvalId : null;
    patch.approvalStatus = approvalStatus;
    patch.approvedAt =
      typeof output.approvedAt === 'string' ? output.approvedAt : undefined;
    patch.approvedBy =
      typeof output.approvedBy === 'string' ? output.approvedBy : undefined;
    patch.inputCaption = inputCaption;
    patch.inputMedia = inputMedia;
    patch.inputType = inferReviewMediaType(inputMedia);
    patch.outputCaption =
      approvalStatus === ReviewGateStatus.APPROVED ? outputCaption : null;
    patch.outputMedia =
      approvalStatus === ReviewGateStatus.APPROVED ? outputMedia : null;
    patch.rejectionReason = rejectionReason;
    patch.status =
      approvalStatus === ReviewGateStatus.PENDING
        ? WorkflowNodeStatus.PROCESSING
        : approvalStatus === ReviewGateStatus.REJECTED
          ? WorkflowNodeStatus.ERROR
          : WorkflowNodeStatus.COMPLETE;
    patch.error = nodeResult.error ?? rejectionReason;
  }

  return {
    nodeId: nodeResult.nodeId,
    patch,
  };
}

export function buildExecutionNodePatches(
  execution: Pick<ExecutionResult, 'nodeResults'>,
): ExecutionNodePatch[] {
  return execution.nodeResults
    .map((nodeResult) => buildExecutionNodePatch(nodeResult))
    .filter((patch): patch is ExecutionNodePatch => patch !== null);
}
