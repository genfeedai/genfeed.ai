import { createHash } from 'node:crypto';
import type { ToolMutationPolicy } from '../interfaces/tool-definition.interface';

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
  'discover_',
  'fetch_',
  'get_',
  'inspect_',
  'list_',
  'present_',
  'render_',
  'score_',
  'search_',
  'suggest_',
  'validate_',
  'verify_',
] as const;

const READ_ONLY_NAMES = new Set<string>([
  'analyze_performance',
  'open_studio_handoff',
  'resolve_approval',
  'resolve_handle',
]);

/**
 * Canonical write-tool policies. Lives beside `creditCost` on the derived
 * registry entry. Reads are omitted (no mutation). CI fails when a write
 * tool is missing from this map.
 */
export const MUTATION_POLICY_BY_NAME: Readonly<
  Record<string, ToolMutationPolicy>
> = {
  ai_action: 'direct',
  analyze_clip_project: 'approval-required',
  approve_social_draft: 'approval-required',
  assign_social_conversation: 'direct',
  batch_approve_reject: 'direct',
  capture_memory: 'direct',
  complete_onboarding: 'direct',
  complete_outreach_sequence: 'direct',
  connect_social_account: 'direct',
  control_scheduled_release: 'approval-required',
  create_ad_remix_workflow: 'approval-required',
  create_article: 'approval-required',
  create_brand: 'approval-required',
  create_chat: 'direct',
  create_clip_project_from_youtube: 'approval-required',
  create_goal: 'direct',
  create_instagram_remix_workflow: 'approval-required',
  create_livestream_bot: 'direct',
  create_outreach_sequence: 'direct',
  create_post: 'approval-required',
  create_scheduled_release: 'approval-required',
  create_social_reply_draft: 'direct',
  create_workflow: 'direct',
  draft_brand_voice_profile: 'direct',
  draft_engagement_reply: 'direct',
  draft_x_quote: 'direct',
  draft_x_repost: 'direct',
  duplicate_workflow: 'direct',
  execute_workflow: 'direct',
  generate_ad_pack: 'direct',
  generate_as_identity: 'direct',
  generate_clips: 'approval-required',
  generate_content: 'direct',
  generate_content_batch: 'approval-required',
  generate_image: 'direct',
  generate_linkedin_content: 'direct',
  generate_monthly_content: 'direct',
  generate_music: 'direct',
  generate_onboarding_content: 'direct',
  generate_video: 'direct',
  generate_voice: 'direct',
  initiate_oauth_connect: 'direct',
  install_official_workflow: 'approval-required',
  install_skills_pro_skill: 'approval-required',
  install_system_workflow: 'direct',
  manage_livestream_bot: 'direct',
  mark_social_conversation_resolved: 'direct',
  pause_outreach_sequence: 'approval-required',
  post_social_reply: 'approval-required',
  prepare_ad_launch_review: 'direct',
  prepare_clip_workflow_run: 'direct',
  prepare_generation: 'direct',
  prepare_voice_clone: 'direct',
  prepare_workflow_trigger: 'direct',
  rate_content: 'direct',
  rate_ingredient: 'direct',
  reframe_image: 'direct',
  reject_social_draft: 'direct',
  rename_brand: 'approval-required',
  replicate_top_ingredient: 'direct',
  repurpose_post: 'direct',
  request_asset: 'direct',
  save_brand_voice_profile: 'direct',
  save_dashboard_layout: 'direct',
  schedule_post: 'direct',
  select_ingredient: 'direct',
  send_chat_message: 'direct',
  send_social_dm: 'approval-required',
  set_workflow_schedule: 'direct',
  skip_brand_interview_question: 'approval-required',
  spawn_content_agent: 'direct',
  start_brand_interview: 'approval-required',
  start_outreach_sequence: 'approval-required',
  submit_brand_interview_answer: 'approval-required',
  tag_social_conversation: 'direct',
  transfer_agent_conversation: 'approval-required',
  update_goal: 'direct',
  update_scheduled_release: 'approval-required',
  update_strategy_state: 'direct',
  upscale_image: 'direct',
};

export function isReadOnlyToolName(name: string): boolean {
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

  if (input.hostSupportsApproval === false) {
    return { error: UNSUPPORTED_APPROVAL_ERROR, kind: 'reject' };
  }

  if (input.hostSupportsApproval === true) {
    return { kind: 'queue' };
  }

  return { kind: 'execute' };
}

export function buildLogicalWriteKey(input: {
  arguments: Record<string, unknown>;
  organizationId: string;
  threadId?: string;
  toolName: string;
  userId: string;
}): string {
  return createHash('sha256')
    .update(
      stableStringify({
        arguments: input.arguments,
        organizationId: input.organizationId,
        threadId: input.threadId ?? '',
        toolName: input.toolName,
        userId: input.userId,
      }),
    )
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
