/**
 * Pure helpers for workflow node idempotency claims (#2359).
 *
 * A claim is won exactly once per (executionId, nodeId). Duplicate claim
 * attempts (BullMQ job retry, overlapping workers) lose cleanly and must
 * re-emit the first result instead of re-executing side-effect nodes.
 */

export type NodeClaimStatus = 'completed' | 'failed' | 'running' | 'pending';

export type NodeClaimRecord = {
  nodeId: string;
  status: NodeClaimStatus;
  output?: unknown;
  error?: string;
};

/**
 * Decide whether a node may run given existing claim rows.
 * - missing → claim (run)
 * - completed/failed → skip with prior result
 * - running → busy (another worker owns it; do not re-run)
 */
export function resolveNodeClaimDecision(
  existing: NodeClaimRecord | undefined,
):
  | { action: 'claim' }
  | { action: 'skip'; record: NodeClaimRecord }
  | { action: 'busy'; record: NodeClaimRecord } {
  if (!existing) {
    return { action: 'claim' };
  }
  if (existing.status === 'completed' || existing.status === 'failed') {
    return { action: 'skip', record: existing };
  }
  if (existing.status === 'running') {
    return { action: 'busy', record: existing };
  }
  return { action: 'claim' };
}

/**
 * In-memory claim map used as a same-process concurrency guard. The production
 * retry contract is owned by durable WorkflowNodeClaim rows and persisted node
 * results; callers release these transient claims when one graph pass ends.
 */
export function claimNodeOnce(
  claims: Map<string, NodeClaimRecord>,
  executionId: string,
  nodeId: string,
): ReturnType<typeof resolveNodeClaimDecision> & { key: string } {
  const key = `${executionId}:${nodeId}`;
  const decision = resolveNodeClaimDecision(claims.get(key));
  if (decision.action === 'claim') {
    claims.set(key, { nodeId, status: 'running' });
  }
  return { ...decision, key };
}

export function completeNodeClaim(
  claims: Map<string, NodeClaimRecord>,
  key: string,
  result: { status: 'completed' | 'failed'; output?: unknown; error?: string },
): void {
  const current = claims.get(key);
  if (!current) {
    return;
  }
  claims.set(key, {
    error: result.error,
    nodeId: current.nodeId,
    output: result.output,
    status: result.status,
  });
}
