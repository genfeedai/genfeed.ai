export type AgentUiActionType =
  | 'oauth_connect_card'
  | 'content_preview_card'
  | 'completion_summary_card'
  | 'payment_cta_card'
  | 'image_transform_card'
  | 'outreach_sequence_create_card'
  | 'outreach_sequence_control_card'
  | 'analytics_snapshot_card'
  | 'publish_post_card'
  | 'review_gate_card'
  | 'generation_action_card'
  | 'ingredient_picker_card'
  | 'workflow_trigger_card'
  | 'clip_workflow_run_card'
  | 'clip_run_card'
  | 'ingredient_alternatives_card'
  | 'schedule_post_card'
  | 'engagement_opportunity_card'
  | 'onboarding_checklist_card'
  | 'credits_balance_card'
  | 'studio_handoff_card'
  | 'brand_create_card'
  | 'brand_identity_confirmation_card'
  | 'workflow_execute_card'
  | 'trending_topics_card'
  | 'content_calendar_card'
  | 'batch_generation_card'
  | 'batch_generation_result_card'
  | 'voice_clone_card'
  | 'brand_voice_profile_card'
  | 'ai_text_action_card'
  | 'ads_search_results_card'
  | 'ad_detail_summary_card'
  | 'campaign_launch_prep_card'
  | 'workflow_created_card'
  | 'bot_created_card'
  | 'next_steps_card'
  | 'livestream_bot_status_card'
  | 'brand_interview_offer_card'
  | 'brand_interview_complete_card'
  | 'agent_transfer_card';

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

export type AgentUiActionHandler = (
  action: string,
  payload?: Record<string, unknown>,
) => boolean | void | Promise<boolean | undefined> | Promise<void>;

export type AgentPublishTargetMediaKind =
  | 'carousel'
  | 'image'
  | 'link'
  | 'short_video'
  | 'video';

export type AgentPublishSettingFieldType =
  | 'boolean'
  | 'multi_select'
  | 'number'
  | 'select'
  | 'string'
  | 'text'
  | 'url';

export interface AgentPublishTargetMedia {
  id?: string;
  isAnimated?: boolean;
  kind: AgentPublishTargetMediaKind;
}

export interface AgentPublishValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface AgentPublishSettingOption {
  label: string;
  value: string;
}

export interface AgentPublishSettingField {
  defaultValue?: boolean | number | string | string[];
  description?: string;
  key: string;
  label: string;
  options?: AgentPublishSettingOption[];
  required?: boolean;
  type: AgentPublishSettingFieldType;
}

/**
 * One scheduler destination inside a `publish_post_card`. The shared caption
 * and visibility live on the parent action; each target carries the effective
 * per-channel override, capability-driven settings, and validation blockers.
 */
export interface AgentPublishTargetProposal {
  blockers: AgentPublishValidationIssue[];
  caption?: string;
  captionMaxLength?: number;
  credentialId: string;
  id: string;
  isCaptionRequired?: boolean;
  isSelected?: boolean;
  label: string;
  media?: AgentPublishTargetMedia[];
  platform: string;
  referenceState?: string;
  scheduledAt?: string;
  settingFields?: AgentPublishSettingField[];
  settings: Record<string, unknown>;
  signatureIds?: string[];
  timezone?: string;
  visibility: PostVisibility;
  warnings?: AgentPublishValidationIssue[];
}

export interface AgentUiActionOutputVariant {
  id: string;
  kind: 'audio' | 'image' | 'text' | 'video';
  textContent?: string;
  threadSegments?: string[];
  thumbnailUrl?: string;
  title?: string;
  url?: string;
}

/**
 * One choice the agent offers the user. Every option carries its own CTAs so a
 * suggestion always renders a control — either navigation to the owning page or
 * an in-conversation follow-up — never bare prose the user cannot act on.
 */
export interface AgentNextStepOption {
  id: string;
  title: string;
  description?: string;
  ctas: AgentUiActionCta[];
}

export interface AgentIngredientItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  title?: string;
}

export type AgentClipRunIdentityField = 'avatar' | 'voice';

export type AgentClipRunIdentitySource =
  | 'brand'
  | 'explicit'
  | 'missing'
  | 'organization';

export interface AgentClipRunIdentity {
  avatarId?: string;
  avatarProvider?: string;
  isComplete: boolean;
  label: string;
  missing: AgentClipRunIdentityField[];
  source: AgentClipRunIdentitySource;
  useIdentity: boolean;
  voiceId?: string;
  voiceProvider?: string;
}

export interface AgentUiAction extends AgentUiActionBase {
  assetId?: string;
  assetKind?: 'image' | 'video' | 'voice';
  ctas?: AgentUiActionCta[];
  data?: Record<string, unknown>;
  contentFormat?:
    | 'article'
    | 'generic'
    | 'newsletter'
    | 'social_post'
    | 'thread';
  platform?: string;
  subject?: string;
  preheader?: string;
  images?: string[];
  videos?: string[];
  audio?: string[];
  voiceoverText?: string;
  tweets?: string[];
  packs?: Array<{ label: string; price: string; credits: number }>;
  metrics?: Record<string, unknown>;
  status?: string;
  summaryText?: string;
  outcomeBullets?: string[];
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
    endFrame?: string;
    references?: string[];
    resolution?: string;
    videoReferences?: string[];
  };
  ingredients?: AgentIngredientItem[];
  workflows?: {
    id: string;
    name: string;
    description?: string;
    status?: string;
  }[];
  outputVariants?: AgentUiActionOutputVariant[];
  clipRun?: {
    autonomousMode?: boolean;
    durationSeconds?: number;
    format?: 'landscape' | 'portrait' | 'square';
    identity?: AgentClipRunIdentity;
    inputValues?: Record<string, unknown>;
    mergeGeneratedVideos?: boolean;
    model?: string;
    prompt?: string;
    requireStepConfirmation?: boolean;
  };
  clipRunState?: Record<string, unknown>;
  alternatives?: {
    label: string;
    prompt: string;
    generationType: 'image' | 'video';
  }[];
  scheduledAt?: string;
  platforms?: string[];
  /** Per-channel scheduler destinations for a `publish_post_card`. */
  targets?: AgentPublishTargetProposal[];
  visibility?: PostVisibility;
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
  signupGiftCredits?: number;
  journeyEarnedCredits?: number;
  journeyRemainingCredits?: number;
  totalOnboardingCreditsVisible?: number;
  thumbnailUrl?: string;
  editorType?: string;
  studioUrl?: string;
  brandName?: string;
  brandDescription?: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  primaryCta?: AgentUiActionCta;
  secondaryCtas?: AgentUiActionCta[];
  utilityCtas?: AgentUiActionCta[];
  contentId?: string;
  scheduleSummary?: string;
  nextRunAt?: string;
  botId?: string;
  botName?: string;
  sessionStatus?: string;
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
  completedCount?: number;
  failedCount?: number;
  creditsUsed?: number;
  /** Completed posts not shown in the max-3 preview strip. */
  remainingCount?: number;
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
  nextSteps?: AgentNextStepOption[];
}

import type { PostVisibility } from '@genfeedai/enums';
