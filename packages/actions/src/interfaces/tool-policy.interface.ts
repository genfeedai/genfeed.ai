import type { AgentUiActionType } from '@genfeedai/contracts/interfaces';

/** The card a tool's result renders as; a subset of the agent card types. */
export type ToolUiActionType = Extract<
  AgentUiActionType,
  | 'ai_text_action_card'
  | 'analytics_snapshot_card'
  | 'onboarding_checklist_card'
  | 'outreach_sequence_control_card'
  | 'oauth_connect_card'
  | 'brand_create_card'
  | 'brand_identity_confirmation_card'
  | 'outreach_sequence_create_card'
  | 'engagement_opportunity_card'
  | 'generation_action_card'
  | 'mutation_approval_card'
  | 'turbo_run_card'
  | 'voice_clone_card'
  | 'content_calendar_card'
  | 'credits_balance_card'
  | 'trending_topics_card'
  | 'review_gate_card'
  | 'studio_handoff_card'
  | 'clipper_workflow_run_card'
  | 'workflow_trigger_card'
  | 'image_transform_card'
  | 'schedule_post_card'
  | 'ingredient_picker_card'
  | 'ingredient_alternatives_card'
  | 'next_steps_card'
>;

export type ToolMutationPolicy = 'approval-required' | 'direct';

/**
 * Where a read gets its data. `stored` reads our own database. `provider`
 * calls a live third party at no cost to the caller. `provider-paid` calls a
 * third party that bills credits or a platform fee per call, so it keeps the
 * cost confirmation and is named `fetch_*`. See `tool-data-sources.ts`.
 */
export type ToolDataSource = 'provider' | 'provider-paid' | 'stored';

/**
 * MCP `tools/list` hints. Clients treat these as hints, not authorization.
 * Every MCP-surfaced tool sets all four; omitting `readOnlyHint` fails load.
 */
export interface ToolAnnotations {
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
  readOnlyHint: boolean;
}

export type ToolCategory =
  | 'generation'
  | 'content'
  | 'workflow'
  | 'analytics'
  | 'campaign'
  | 'onboarding'
  | 'social'
  | 'admin'
  | 'ads'
  | 'ui'
  | 'proactive'
  | 'identity'
  | 'agent-control'
  | 'other';

/** The card the MCP app renders a tool's result as. */
export type ToolMcpCardKind = 'article' | 'media' | 'post' | 'summary';
