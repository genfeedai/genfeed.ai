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
  'find_',
  'get_',
  'search_',
  'validate_',
] as const;

const GENERATION_OPEN_WORLD_NAMES: ReadonlySet<string> = new Set([
  'enhance_prompt',
  'execute_workflow',
  'onboard_brand',
  'get_x_posts',
  'get_x_account_activity',
  'get_articles',
  'get_social_conversation',
  'get_social_conversations',
  'get_ads_ad_insights',
  'get_ads_adset_insights',
  'import_source_post',
  'start_remix_generation',
  'control_remix_generation',
  'start_storyboard_long_form',
  'replace_storyboard_character',
  'run_clipper',
  'transform_media',
]);

/**
 * Pinned even when another rule would already decide the hint. Scheduler
 * writes are approval-required; these three reads match a prefix.
 * `resolve_approval` is classified read-only for mutation policy (it must
 * not queue another approval) but it executes or cancels a queued write.
 */
const DESTRUCTIVE_HINT_NAMES: ReadonlySet<string> = new Set([
  'cancel_visual_code_project',
  'control_scheduled_release',
  'create_scheduled_release',
  'resolve_approval',
  'update_scheduled_release',
]);

const READ_ONLY_HINT_NAMES: ReadonlySet<string> = new Set([
  'quote_visual_code_generation',
  'validate_scheduler_target',
]);

/**
 * Writes that do not delete or overwrite existing data. The default is
 * `destructiveHint = !readOnlyHint`; this set is the per-tool override.
 * `create_post` is draft-only on MCP, so the draft write is not destructive.
 */
const NON_DESTRUCTIVE_WRITE_NAMES: ReadonlySet<string> = new Set([
  'enhance_prompt',
  'generate',
  'import_source_post',
  'create_remix_concept',
  'create_storyboard_remix',
  'complete_media_upload',
  'request_media_upload',
  'create_post',
  'get_x_posts',
  'get_x_account_activity',
  'open_in_editor',
  'create_task',
  'start_editor_render',
  'transform_media',
]);

const PUBLISHING_TOOL_NAMES: ReadonlySet<string> = new Set(
  CURATED_ACTION_CATALOG.filter((entry) =>
    isPublishingApprovalRequired(entry),
  ).map((entry) => entry.name),
);

/** Presentation-only corrections for audited handlers that write or incur spend. */
const AUDITED_BEHAVIOR_HINT_OVERRIDES: ReadonlyMap<string, ToolAnnotations> =
  new Map([
    [
      'get_ad_research_detail',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'get_ads_research',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'check_channel',
      {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    ],
    [
      'upload_media',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    ],
    [
      'get_brand_context',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'get_clipper_project',
      {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'get_instagram_inspiration_detail',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'get_remix_run',
      {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    ],
    [
      'get_instagram_inspiration',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'search_knowledge',
      {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    ],
    [
      'verify_skills_pro_entitlement',
      {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    ],
  ]);

export function toolTitleFromName(name: string): string {
  return name
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isOpenWorldTool(name: string): boolean {
  return (
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
  if (NON_DESTRUCTIVE_WRITE_NAMES.has(name)) {
    readOnlyHint = false;
    destructiveHint = false;
  }

  const annotations: ToolAnnotations = {
    destructiveHint,
    idempotentHint: readOnlyHint,
    openWorldHint: isOpenWorldTool(name),
    readOnlyHint,
    ...AUDITED_BEHAVIOR_HINT_OVERRIDES.get(name),
  };

  return { annotations, title: toolTitleFromName(name) };
}
