import {
  hasReadOnlyToolPrefix,
  type ToolMutationPolicy,
} from '@genfeedai/mcp-kit';
import {
  CURATED_ACTION_CATALOG,
  curatedActionNames,
} from './curated-action-catalog';
import { PROVIDER_PAID_TOOLS } from './source/tool-data-sources';

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
  return hasReadOnlyToolPrefix(name);
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
