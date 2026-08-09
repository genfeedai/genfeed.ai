import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';

const GENERIC_DONE_COPY = new Set([
  'generated content for this request.',
  'generated content for this request',
  'done',
  'completed',
  'complete',
  'finished',
  'success',
]);

/**
 * Product result cards that already own the turn. A generic Done summary
 * stacked on top is pure chrome noise (T3/Codex density).
 */
export const PRODUCT_RESULT_CARD_TYPES = new Set<AgentUiAction['type']>([
  'batch_generation_result_card',
  'batch_generation_card',
  'content_preview_card',
  'image_transform_card',
  'clip_run_card',
  'clip_workflow_run_card',
  'analytics_snapshot_card',
  'publish_post_card',
  'review_gate_card',
  'studio_handoff_card',
  'ai_text_action_card',
  'workflow_created_card',
  'workflow_execute_card',
  'workflow_trigger_card',
  'brand_create_card',
  'brand_identity_confirmation_card',
  'brand_interview_offer_card',
  'brand_interview_complete_card',
  'ads_search_results_card',
  'ad_detail_summary_card',
  'campaign_launch_prep_card',
  'campaign_create_card',
  'campaign_control_card',
  'schedule_post_card',
  'content_calendar_card',
  'trending_topics_card',
  'voice_clone_card',
  'brand_voice_profile_card',
  'ingredient_alternatives_card',
  'ingredient_picker_card',
  'engagement_opportunity_card',
  'credits_balance_card',
  'payment_cta_card',
  'oauth_connect_card',
  'bot_created_card',
  'livestream_bot_status_card',
  'onboarding_checklist_card',
]);

function isGenericDoneCopy(value: string | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }
  return GENERIC_DONE_COPY.has(value.trim().toLowerCase());
}

/** True when Done carries media, bullets, or non-generic outcome copy. */
export function completionSummaryHasOutcomeSignal(
  action: AgentUiAction,
): boolean {
  if ((action.outputVariants?.length ?? 0) > 0) {
    return true;
  }
  if ((action.secondaryCtas?.length ?? 0) > 0) {
    return true;
  }
  if ((action.outcomeBullets?.length ?? 0) > 0) {
    return true;
  }
  if (
    !isGenericDoneCopy(action.summaryText) ||
    !isGenericDoneCopy(action.description)
  ) {
    return true;
  }
  return false;
}

export function hasProductResultCard(
  actions: readonly AgentUiAction[],
): boolean {
  return actions.some((action) => PRODUCT_RESULT_CARD_TYPES.has(action.type));
}

/**
 * Hide the sticky "Done" card when it adds no signal beyond a sibling product
 * result card. Keeps T3/Codex density: one result surface per turn.
 */
export function shouldRenderCompletionSummary(
  action: AgentUiAction,
  siblingActions: readonly AgentUiAction[],
): boolean {
  if (action.type !== 'completion_summary_card') {
    return false;
  }

  // Real media / bullets / non-generic copy always stay — Done is the story.
  if (completionSummaryHasOutcomeSignal(action)) {
    return true;
  }

  // Any product result card already owns the turn — drop generic Done.
  if (hasProductResultCard(siblingActions)) {
    return false;
  }

  return true;
}
