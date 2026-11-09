import type { ToolMutationPolicy } from '../interfaces/tool-definition.interface';
import {
  CURATED_ACTION_CATALOG,
  curatedActionNames,
} from './curated-action-catalog';
import { PROVIDER_PAID_TOOLS } from './source/tool-data-sources';

export type { ToolMutationPolicy } from '../interfaces/tool-definition.interface';

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

const READ_ONLY_PREFIXES = [
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

const WRITE_NAMES_WITH_READ_PREFIX = new Set([
  'present_work_object',
  'render_3d',
]);

const READ_ONLY_NAMES: ReadonlySet<string> = curatedActionNames(
  (entry) => entry.isReadOnly === true,
);

/**
 * Canonical write-tool policies, declared as `mutationPolicy` on each curated
 * catalog entry. Lives beside `creditCost` on the derived registry entry.
 * Reads are omitted (no mutation). CI fails when a write tool is missing one.
 */
export const MUTATION_POLICY_BY_NAME: Readonly<
  Record<string, ToolMutationPolicy>
> = Object.fromEntries(
  CURATED_ACTION_CATALOG.flatMap((entry) =>
    'mutationPolicy' in entry ? [[entry.name, entry.mutationPolicy]] : [],
  ),
);

export function isReadOnlyToolName(name: string): boolean {
  if (WRITE_NAMES_WITH_READ_PREFIX.has(name)) return false;
  if (PROVIDER_PAID_TOOLS.has(name)) return false;
  if (READ_ONLY_NAMES.has(name)) {
    return true;
  }
  return READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function toolRequiresMutationPolicy(name: string): boolean {
  return !isReadOnlyToolName(name);
}

export function getDeclaredMutationPolicy(
  name: string,
): ToolMutationPolicy | undefined {
  return MUTATION_POLICY_BY_NAME[name];
}

export function isApprovalRequiredToolName(name: string): boolean {
  return MUTATION_POLICY_BY_NAME[name] === 'approval-required';
}

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
