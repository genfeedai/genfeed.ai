export type AgentUiActionType =
  | 'oauth_connect_card'
  | 'content_preview_card'
  | 'payment_cta_card'
  | 'image_transform_card'
  | 'campaign_create_card'
  | 'campaign_control_card'
  | 'analytics_snapshot_card'
  | 'review_gate_card'
  | 'generation_action_card'
  | 'ingredient_picker_card'
  | 'workflow_trigger_card'
  | 'clip_workflow_run_card'
  | 'ingredient_alternatives_card'
  | 'schedule_post_card'
  | 'engagement_opportunity_card'
  | 'onboarding_checklist_card'
  | 'credits_balance_card'
  | 'studio_handoff_card'
  | 'brand_create_card'
  | 'workflow_execute_card'
  | 'trending_topics_card'
  | 'content_calendar_card'
  | 'batch_generation_card'
  | 'voice_clone_card'
  | 'ai_text_action_card';

export interface AgentUiActionBase {
  id: string;
  type: AgentUiActionType;
  title: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

export interface AgentUiActionCta {
  label: string;
  href?: string;
  action?: string;
  payload?: Record<string, unknown>;
}

export interface AgentIngredientItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  title?: string;
}

export interface AgentUiAction extends AgentUiActionBase {
  ctas?: AgentUiActionCta[];
  data?: Record<string, unknown>;
  platform?: string;
  images?: string[];
  videos?: string[];
  audio?: string[];
  tweets?: string[];
  packs?: Array<{ label: string; price: string; credits: number }>;
  metrics?: Record<string, unknown>;
  status?: string;
  items?: Array<{
    id: string;
    title: string;
    type?: string;
    platform?: string;
    previewUrl?: string;
  }>;
  generationType?: 'image' | 'video';
  generationParams?: {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    duration?: number;
  };
  ingredients?: AgentIngredientItem[];
  workflows?: {
    id: string;
    name: string;
    description?: string;
    status?: string;
  }[];
  clipRun?: {
    autonomousMode?: boolean;
    durationSeconds?: number;
    format?: 'landscape' | 'portrait' | 'square';
    inputValues?: Record<string, unknown>;
    mergeGeneratedVideos?: boolean;
    model?: string;
    prompt?: string;
    requireStepConfirmation?: boolean;
  };
  alternatives?: {
    label: string;
    prompt: string;
    generationType: 'image' | 'video';
  }[];
  scheduledAt?: string;
  platforms?: string[];
  creditEstimate?: number;
  originalPost?: {
    author: string;
    content: string;
    platform?: string;
    url?: string;
  };
  draftReply?: string;
  checklist?: {
    id: string;
    label: string;
    isCompleted: boolean;
    rewardCredits?: number;
    isClaimed?: boolean;
    isRecommended?: boolean;
    description?: string;
    ctaLabel?: string;
    ctaHref?: string;
  }[];
  earnedCredits?: number;
  totalJourneyCredits?: number;
  completionPercent?: number;
  balance?: number;
  usagePercent?: number;
  usageLabel?: string;
  thumbnailUrl?: string;
  editorType?: string;
  studioUrl?: string;
  brandName?: string;
  brandDescription?: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  trends?: {
    id: string;
    label: string;
    score?: number;
    platform?: string;
  }[];
  calendarDays?: {
    date: string;
    postCount: number;
  }[];
  batchCount?: number;
  audioUrl?: string;
  cloneProgress?: number;
  brandId?: string;
  recommendedVoiceId?: string;
  canUpload?: boolean;
  canUseExisting?: boolean;
  existingVoices?: Array<{
    id: string;
    label: string;
    provider?: string;
    cloneStatus?: string;
  }>;
  textContent?: string;
  textActions?: string[];
}
