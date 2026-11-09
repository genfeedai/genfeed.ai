import type {
  ToolAnnotations,
  ToolMutationPolicy,
} from '../../interfaces/tool-definition.interface';
import {
  curatedActionNames,
  getCuratedAction,
  isPublishingApprovalRequired,
} from '../curated-action-catalog';
import { isReadOnlyToolName } from '../mutation-policy';
import { toolDataSource } from './tool-data-sources';

/**
 * Prefixes the issue treats as reads. The mutation-policy classifier covers
 * the rest (`compare_`, `inspect_`, named reads, and so on) so a tool that is
 * already non-mutating is not confirmed on every call. `fetch_` tools are the
 * paid provider reads (`tool-data-sources.ts`) and always keep the prompt.
 */
const READ_ONLY_HINT_PREFIXES = [
  'describe_',
  'find_',
  'get_',
  'search_',
  'validate_',
] as const;

/** Generation and write tools that reach beyond our own database. */
const GENERATION_OPEN_WORLD_NAMES = curatedActionNames(
  (entry) => entry.isOpenWorld === true,
);

/**
 * Pinned even when another rule would already decide the hint. Scheduler
 * writes are approval-required; these three reads match a prefix.
 * `resolve_approval` is classified read-only for mutation policy (it must
 * not queue another approval) but it executes or cancels a queued write.
 */
const DESTRUCTIVE_HINT_NAMES = curatedActionNames(
  (entry) => entry.annotationHint === 'destructive',
);

const READ_ONLY_HINT_NAMES = curatedActionNames(
  (entry) => entry.annotationHint === 'read-only',
);

/**
 * Writes that do not delete or overwrite existing data. The default is
 * `destructiveHint = !readOnlyHint`; this set is the per-tool override.
 * `create_post` is draft-only on MCP, so the draft write is not destructive.
 */
const NON_DESTRUCTIVE_WRITE_NAMES = curatedActionNames(
  (entry) => entry.annotationHint === 'non-destructive-write',
);

const PUBLISHING_TOOL_NAMES = curatedActionNames((entry) =>
  isPublishingApprovalRequired(entry),
);

export function toolTitleFromName(name: string): string {
  return name
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isOpenWorldTool(name: string): boolean {
  return (
    toolDataSource(name) !== 'stored' ||
    name === 'generate' ||
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
  if (toolDataSource(name) === 'provider-paid') return false;
  if (READ_ONLY_HINT_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  return isReadOnlyToolName(name);
}

/**
 * Title plus the four MCP hints for one tool. Defaults come from
 * `mutationPolicy` and the read classifier; audited presentation overrides win.
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
  if (
    NON_DESTRUCTIVE_WRITE_NAMES.has(name) ||
    toolDataSource(name) === 'provider-paid'
  ) {
    readOnlyHint = false;
    destructiveHint = false;
  }

  const annotations: ToolAnnotations = {
    destructiveHint,
    idempotentHint: readOnlyHint,
    openWorldHint: isOpenWorldTool(name),
    readOnlyHint,
    ...getCuratedAction(name)?.annotationOverride,
  };

  return { annotations, title: toolTitleFromName(name) };
}
