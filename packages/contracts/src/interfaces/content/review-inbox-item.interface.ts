/**
 * One row of the publishing review inbox (#7340): a gate an agent, workflow
 * or MCP client is waiting on. Turbo run drafts keep their own batch model;
 * these rows cover the gates that live outside a batch.
 */
export type ReviewInboxItemKind = 'workflow_review_gate' | 'mcp_approval';

/** Who is asking: an agent draft, a workflow run, or an MCP client. */
export type ReviewInboxItemSource = 'agent' | 'workflow' | 'mcp_client';

export type ReviewInboxDecision = 'approve' | 'reject';

/**
 * Why an item needs attention beyond the plain request, such as a Policy
 * violation. Empty until a producer records reasons.
 */
export interface IReviewInboxItemReason {
  code: string;
  message: string;
}

export interface IReviewInboxItemPreview {
  caption: string | null;
  mediaUrl: string | null;
}

export interface IReviewInboxItem {
  /** Stable inbox id: `<kind>:<identity>`; see `buildReviewInboxItemId`. */
  id: string;
  kind: ReviewInboxItemKind;
  source: ReviewInboxItemSource;
  /** Workflow label or MCP tool name. */
  sourceLabel: string;
  brandId: string | null;
  brandLabel: string | null;
  /** One line naming what the requester wants to do. */
  actionSummary: string;
  preview: IReviewInboxItemPreview;
  requestedAt: string;
  /** When the gate resolves on its own (workflow review-gate timeout). */
  expiresAt: string | null;
  status: 'pending';
  /** Whether the current viewer may approve or reject this item. */
  isResolvable: boolean;
  reasons: IReviewInboxItemReason[];
  workflowId: string | null;
  executionId: string | null;
  nodeId: string | null;
  approvalId: string | null;
  toolName: string | null;
  estimatedCredits: number | null;
}

/** `GET /review-inbox` query: the brand the page shows, when it has one. */
export interface IReviewInboxListQuery {
  brandId?: string;
}

export interface IReviewInboxDecisionRequest {
  itemId: string;
  decision: ReviewInboxDecision;
  reason?: string;
}

export interface IReviewInboxDecisionResult {
  id: string;
  itemId: string;
  kind: ReviewInboxItemKind;
  decision: ReviewInboxDecision;
  status: 'approved' | 'rejected';
  resolvedAt: string;
}

export type ParsedReviewInboxItemId =
  | { kind: 'workflow_review_gate'; executionId: string; nodeId: string }
  | { kind: 'mcp_approval'; approvalId: string };

export function buildReviewInboxItemId(item: ParsedReviewInboxItemId): string {
  return item.kind === 'mcp_approval'
    ? `mcp_approval:${item.approvalId}`
    : `workflow_review_gate:${item.executionId}:${item.nodeId}`;
}

/** Returns null for anything that is not a well-formed inbox id. */
export function parseReviewInboxItemId(
  value: string,
): ParsedReviewInboxItemId | null {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);
  if (kind === 'mcp_approval') {
    return rest && !rest.includes(':')
      ? { approvalId: rest, kind: 'mcp_approval' }
      : null;
  }
  if (kind === 'workflow_review_gate') {
    const nodeSeparator = rest.indexOf(':');
    if (nodeSeparator <= 0) return null;
    const executionId = rest.slice(0, nodeSeparator);
    const nodeId = rest.slice(nodeSeparator + 1);
    return nodeId
      ? { executionId, kind: 'workflow_review_gate', nodeId }
      : null;
  }
  return null;
}
