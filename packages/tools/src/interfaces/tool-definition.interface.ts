export type ToolUiActionType =
  | 'ai_text_action_card'
  | 'analytics_snapshot_card'
  | 'onboarding_checklist_card'
  | 'campaign_control_card'
  | 'oauth_connect_card'
  | 'brand_create_card'
  | 'campaign_create_card'
  | 'engagement_opportunity_card'
  | 'generation_action_card'
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
  | 'ingredient_alternatives_card';

export interface ToolParameterSchema {
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
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  creditCost: number;
  requiredRole: ToolRequiredRole;
  surfaces: ToolSurfaceConfig;
  category: ToolCategory;
  uiActionType?: ToolUiActionType;
  tags?: string[];
  requiresConfirmation?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}
