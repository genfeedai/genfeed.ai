import type { AgentUiAction } from './agent-ui-action.interface';

/** @deprecated Prefer canonical tool metadata from @genfeedai/tools. */
export enum AgentToolName {
  GENERATE_IMAGE = 'generate_image',
  REFRAME_IMAGE = 'reframe_image',
  LIST_WORKFLOWS = 'list_workflows',
  CREATE_WORKFLOW = 'create_workflow',
  EXECUTE_WORKFLOW = 'execute_workflow',
  GET_ANALYTICS = 'get_analytics',
  CREATE_POST = 'create_post',
  LIST_POSTS = 'list_posts',
  SCHEDULE_POST = 'schedule_post',
  AI_ACTION = 'ai_action',
  GENERATE_CONTENT = 'generate_content',
  GENERATE_CONTENT_BATCH = 'generate_content_batch',
  GET_TRENDS = 'get_trends',
  LIST_BRANDS = 'list_brands',
  GET_CURRENT_BRAND = 'get_current_brand',
  GET_CREDITS_BALANCE = 'get_credits_balance',
  UPSCALE_IMAGE = 'upscale_image',
  GENERATE_VIDEO = 'generate_video',
  GENERATE_MUSIC = 'generate_music',
  GENERATE_VOICE = 'generate_voice',
  OPEN_STUDIO_HANDOFF = 'open_studio_handoff',
  GET_CONNECTION_STATUS = 'get_connection_status',
  INITIATE_OAUTH_CONNECT = 'initiate_oauth_connect',
  CREATE_CAMPAIGN = 'create_campaign',
  START_CAMPAIGN = 'start_campaign',
  PAUSE_CAMPAIGN = 'pause_campaign',
  COMPLETE_CAMPAIGN = 'complete_campaign',
  GET_CAMPAIGN_ANALYTICS = 'get_campaign_analytics',
  RESOLVE_HANDLE = 'resolve_handle',
  LIST_REVIEW_QUEUE = 'list_review_queue',
  BATCH_APPROVE_REJECT = 'batch_approve_reject',
  // Proactive agent tools
  DISCOVER_ENGAGEMENTS = 'discover_engagements',
  DRAFT_ENGAGEMENT_REPLY = 'draft_engagement_reply',
  GET_APPROVAL_SUMMARY = 'get_approval_summary',
  ANALYZE_PERFORMANCE = 'analyze_performance',
  GET_CONTENT_CALENDAR = 'get_content_calendar',
  UPDATE_STRATEGY_STATE = 'update_strategy_state',
  // Onboarding tools
  CREATE_BRAND = 'create_brand',
  CHECK_ONBOARDING_STATUS = 'check_onboarding_status',
  COMPLETE_ONBOARDING = 'complete_onboarding',
  CONNECT_SOCIAL_ACCOUNT = 'connect_social_account',
  GENERATE_ONBOARDING_CONTENT = 'generate_onboarding_content',
  PRESENT_PAYMENT_OPTIONS = 'present_payment_options',
  GENERATE_MONTHLY_CONTENT = 'generate_monthly_content',
  // Identity tools
  GENERATE_AS_IDENTITY = 'generate_as_identity',
  // Dashboard tools
  RENDER_DASHBOARD = 'render_dashboard',
  // Generation preparation tools
  PREPARE_GENERATION = 'prepare_generation',
  PREPARE_WORKFLOW_TRIGGER = 'prepare_workflow_trigger',
  PREPARE_VOICE_CLONE = 'prepare_voice_clone',
  PREPARE_CLIP_WORKFLOW_RUN = 'prepare_clip_workflow_run',
  SUGGEST_INGREDIENT_ALTERNATIVES = 'suggest_ingredient_alternatives',
  // Sub-agent spawning
  SPAWN_CONTENT_AGENT = 'spawn_content_agent',
  // Ingredient picker tools
  SELECT_INGREDIENT = 'select_ingredient',
  // Campaign coordination tools
  REQUEST_ASSET = 'request_asset',
}

/** @deprecated Prefer canonical tool metadata from @genfeedai/tools. */
export interface AgentToolDefinition {
  name: AgentToolName;
  description: string;
  parameters: Record<string, unknown>;
  creditCost: number;
}

export interface AgentToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  creditsUsed: number;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
  nextActions?: AgentUiAction[];
}
