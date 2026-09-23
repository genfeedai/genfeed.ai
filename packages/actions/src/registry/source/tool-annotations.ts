import type {
  ToolAnnotations,
  ToolMutationPolicy,
} from '../../interfaces/tool-definition.interface';
import {
  CURATED_ACTION_CATALOG,
  isPublishingApprovalRequired,
} from '../curated-action-catalog';
import { isReadOnlyToolName } from '../mutation-policy';

/**
 * Prefixes the issue treats as reads. The mutation-policy classifier covers
 * the rest (`compare_`, `fetch_`, `inspect_`, named reads, and so on) so a
 * tool that is already non-mutating is not confirmed on every call.
 */
const READ_ONLY_HINT_PREFIXES = [
  'describe_',
  'get_',
  'list_',
  'search_',
  'validate_',
] as const;

const GENERATION_OPEN_WORLD_NAMES: ReadonlySet<string> = new Set([
  'reframe_image',
  'upscale_image',
]);

/**
 * Pinned even when another rule would already decide the hint. Scheduler
 * writes are approval-required; these three reads match a prefix.
 * `resolve_approval` is classified read-only for mutation policy (it must
 * not queue another approval) but it executes or cancels a queued write.
 */
const DESTRUCTIVE_HINT_NAMES: ReadonlySet<string> = new Set([
  'control_scheduled_release',
  'create_scheduled_release',
  'resolve_approval',
  'update_scheduled_release',
]);

const READ_ONLY_HINT_NAMES: ReadonlySet<string> = new Set([
  'get_account_info',
  'list_brands',
  'validate_scheduler_target',
]);

const PUBLISHING_TOOL_NAMES: ReadonlySet<string> = new Set(
  CURATED_ACTION_CATALOG.filter((entry) =>
    isPublishingApprovalRequired(entry),
  ).map((entry) => entry.name),
);

export function toolTitleFromName(name: string): string {
  return name
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isOpenWorldTool(name: string): boolean {
  return (
    name.startsWith('generate_') ||
    GENERATION_OPEN_WORLD_NAMES.has(name) ||
    PUBLISHING_TOOL_NAMES.has(name)
  );
}

function isDefaultReadOnly(
  name: string,
  policy: ToolMutationPolicy | undefined,
): boolean {
  if (policy === 'approval-required') return false;
  if (READ_ONLY_HINT_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  return isReadOnlyToolName(name);
}

/**
 * Title plus the four MCP hints for one tool. Defaults come from
 * `mutationPolicy` and the read classifier; the pinned name sets win.
 */
export function deriveMcpToolPresentation(
  name: string,
  mutationPolicy: ToolMutationPolicy | undefined,
): { annotations: ToolAnnotations; title: string } {
  let readOnlyHint = isDefaultReadOnly(name, mutationPolicy);
  let destructiveHint = !readOnlyHint;

  if (DESTRUCTIVE_HINT_NAMES.has(name)) {
    readOnlyHint = false;
    destructiveHint = true;
  }
  if (READ_ONLY_HINT_NAMES.has(name)) {
    readOnlyHint = true;
    destructiveHint = false;
  }

  const annotations: ToolAnnotations = {
    destructiveHint,
    idempotentHint: readOnlyHint,
    openWorldHint: isOpenWorldTool(name),
    readOnlyHint,
  };

  return { annotations, title: toolTitleFromName(name) };
}
