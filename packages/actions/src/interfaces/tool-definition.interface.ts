import type { CuratedActionName } from '../registry/curated-action-catalog';
import type { ToolsetName } from '../registry/toolset-names';

export type ToolUiActionType =
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
  | 'batch_generation_card'
  | 'voice_clone_card'
  | 'content_calendar_card'
  | 'credits_balance_card'
  | 'trending_topics_card'
  | 'review_gate_card'
  | 'studio_handoff_card'
  | 'clip_workflow_run_card'
  | 'workflow_trigger_card'
  | 'payment_cta_card'
  | 'image_transform_card'
  | 'schedule_post_card'
  | 'ingredient_picker_card'
  | 'ingredient_alternatives_card'
  | 'next_steps_card';

export interface ToolParameterSchema {
  $defs?: Record<string, unknown>;
  additionalProperties?: false;
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolSurfaceConfig {
  agent: boolean;
  mcp: boolean;
  cliAgentVisible: boolean;
}

export type ToolRequiredRole = 'user' | 'admin' | 'superadmin';

export type ToolMutationPolicy = 'approval-required' | 'direct';

/**
 * What one call can cost. `creditCost` stays the orchestrator floor so a
 * delegated handler is not charged twice. This field is the amount clients
 * and approval cards show, taken from the same helpers the debit path uses.
 */
export type ToolCreditPricing =
  | { amount: number; mode: 'fixed' }
  | { maximum: number; minimum: number; mode: 'variable'; unit: string }
  | { mode: 'quote'; quoteTool: string };

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

export interface CanonicalToolDefinition {
  name: CuratedActionName;
  description: string;
  parameters: ToolParameterSchema;
  creditCost: number;
  /**
   * Honest cost. Omitted only on hand-built fixtures; assembly always sets it.
   * A fixed amount may be higher than `creditCost` when the handler bills
   * and the orchestrator floor is intentionally zero.
   */
  creditPricing?: ToolCreditPricing;
  requiredRole: ToolRequiredRole;
  surfaces: ToolSurfaceConfig;
  category: ToolCategory;
  toolset: ToolsetName;
  /**
   * Human-readable MCP title. Set for every MCP-surfaced tool.
   * Directory clients require it alongside {@link annotations}.
   */
  title?: string;
  annotations?: ToolAnnotations;
  mutationPolicy?: ToolMutationPolicy;
  uiActionType?: ToolUiActionType;
  tags?: string[];
  requiresConfirmation?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}
