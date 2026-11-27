/** How a write runs: at once, or only after the person approves it. */
export type ToolMutationPolicy = 'approval-required' | 'direct';

export const TOOL_MUTATION_POLICY = {
  APPROVAL_REQUIRED: 'approval-required',
  DIRECT: 'direct',
} as const satisfies Record<string, ToolMutationPolicy>;

export const UNSUPPORTED_APPROVAL_ERROR =
  'UNSUPPORTED_APPROVAL: host does not support approval-required mutations';

export const POLICY_REVOKED_ERROR =
  'MUTATION_POLICY_REVOKED: tool is unavailable or no longer executable on this surface';

export type MutationApprovalStatus = 'APPROVED' | 'DECLINED' | 'PENDING';

export type MutationPolicyDecision =
  | { kind: 'execute' }
  | { kind: 'queue' }
  | { kind: 'replay'; result: Record<string, unknown> }
  | { kind: 'reject'; error: string };

/**
 * Name prefixes that mark a tool as a read. A server keeps its own list of
 * exceptions (a prefixed name that writes or spends, a read without a prefix).
 */
export const READ_ONLY_TOOL_PREFIXES = [
  'check_',
  'compare_',
  'describe_',
  'discover_',
  'fetch_',
  'find_',
  'get_',
  'inspect_',
  'present_',
  'render_',
  'score_',
  'search_',
  'suggest_',
  'validate_',
  'verify_',
] as const;

export function hasReadOnlyToolPrefix(name: string): boolean {
  return READ_ONLY_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * What a call does under its tool's mutation policy. A tool that is gone from
 * the surface is refused; a direct tool runs; an approval-required tool
 * replays an approved result, runs after a trusted approval, queues on a host
 * that can show an approval, and is refused on one that cannot.
 */
export function evaluateMutationPolicy(input: {
  existing?: {
    result?: Record<string, unknown> | null;
    status: MutationApprovalStatus;
  };
  hasTrustedApproval: boolean;
  hostSupportsApproval?: boolean;
  isAvailableOnSurface: boolean;
  policy: ToolMutationPolicy | undefined;
}): MutationPolicyDecision {
  if (!input.isAvailableOnSurface) {
    return { error: POLICY_REVOKED_ERROR, kind: 'reject' };
  }

  if (input.policy !== 'approval-required') {
    return { kind: 'execute' };
  }

  if (input.existing?.status === 'APPROVED' && input.existing.result) {
    return { kind: 'replay', result: input.existing.result };
  }

  if (input.hasTrustedApproval) {
    return { kind: 'execute' };
  }

  if (input.hostSupportsApproval !== true) {
    return { error: UNSUPPORTED_APPROVAL_ERROR, kind: 'reject' };
  }

  return { kind: 'queue' };
}
