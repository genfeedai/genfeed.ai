import type {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';

/**
 * Trigger event payload that initiates workflow execution.
 * The `type` must match a trigger node type in the workflow graph.
 */
export interface TriggerEvent {
  /** Trigger type matching a trigger node (e.g. 'mentionTrigger', 'newFollowerTrigger') */
  type: string;
  /** Platform the event originated from */
  platform: string;
  /** Organization that owns the workflow */
  organizationId: string;
  /** User associated with the trigger */
  userId: string;
  /** Trigger-specific data passed as input to the trigger node */
  data: Record<string, unknown>;
}

/**
 * Result of a full workflow execution run.
 */
export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  nodeResults: NodeExecutionSummary[];
  totalCreditsUsed: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface NodeExecutionSummary {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  creditsUsed: number;
}

/**
 * Delay job data for BullMQ delayed job scheduling.
 */
export interface DelayResumeJobData {
  executionId: string;
  workflowId: string;
  organizationId: string;
  userId: string;
  /** The delay node that triggered the pause */
  delayNodeId: string;
  /** Remaining node IDs to execute after the delay */
  remainingNodeIds: string[];
  /** Cached outputs from already-executed nodes */
  nodeOutputCache: Record<string, unknown>;
  /** The trigger event that started this execution */
  triggerEvent: TriggerEvent;
}

export interface PendingReviewGateState {
  nodeId: string;
  requestedAt: string;
  inputMedia: string | null;
  inputCaption: string | null;
  rawMedia?: unknown;
  rawCaption?: unknown;
  /**
   * Node config captured at pause time so the timeout sweep and the reviewer
   * notifier never need to re-read the workflow document to resolve behavior.
   */
  timeoutHours: number;
  autoApproveIfNoResponse: boolean;
  notifyChannels: string[];
  notifyEmail?: string;
  webhookUrl?: string;
  slackChannel?: string;
  /**
   * Id of the task-inbox task created for this pending review, if any, so
   * resolution (approve / reject / timeout) can close it.
   */
  taskId?: string;
}

export interface ReviewGateApprovalResult {
  executionId: string;
  nodeId: string;
  status: 'approved' | 'rejected';
  approvedBy: string;
  approvedAt: string;
  rejectionReason?: string;
}

/** Outcome of an automatic timeout resolution performed by the sweep. */
export interface ReviewGateTimeoutResolution {
  executionId: string;
  nodeId: string;
  resolution: 'approved' | 'rejected';
}

export interface ExecuteWorkflowDocumentOptions {
  trigger: WorkflowExecutionTrigger;
  metadata?: Record<string, unknown>;
}
