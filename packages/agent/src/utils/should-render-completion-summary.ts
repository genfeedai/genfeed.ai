import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';

const GENERIC_DONE_COPY = new Set([
  'generated content for this request.',
  'generated content for this request',
  'completed this request successfully.',
  'completed this request successfully',
  'done',
  'completed',
  'complete',
  'finished',
  'success',
]);

/** Tool-inventory bullets from the generic tool-only Done card — not product signal. */
function isToolInventoryBullet(bullet: string): boolean {
  const trimmed = bullet.trim();
  return (
    /^\d+\s+tool action(s)?\s+completed$/i.test(trimmed) ||
    /^tool:\s+/i.test(trimmed)
  );
}

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
  'outreach_sequence_create_card',
  'outreach_sequence_control_card',
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

/** True when Done carries media, real product bullets, or non-generic copy. */
export function completionSummaryHasOutcomeSignal(
  action: AgentUiAction,
): boolean {
  if ((action.outputVariants?.length ?? 0) > 0) {
    return true;
  }
  if ((action.secondaryCtas?.length ?? 0) > 0) {
    return true;
  }

  const bullets = action.outcomeBullets ?? [];
  const hasProductBullets = bullets.some(
    (bullet) => !isToolInventoryBullet(bullet),
  );
  if (hasProductBullets) {
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
 * Hide the sticky "Done" card when it adds no product signal — sibling product
 * cards own the turn, and tool-inventory-only Done on clarify turns is chrome
 * noise (T3/Codex density).
 */
export function shouldRenderCompletionSummary(
  action: AgentUiAction,
  siblingActions: readonly AgentUiAction[],
): boolean {
  if (action.type !== 'completion_summary_card') {
    return false;
  }

  // A concrete preview/result is the outcome. Repeating the same text/media
  // in a generic Done card creates two competing surfaces for one result.
  if (
    hasProductResultCard(
      siblingActions.filter((sibling) => sibling.id !== action.id),
    )
  ) {
    return false;
  }

  // Real media / product bullets / non-generic copy stay — Done is the story.
  // Generic / tool-inventory-only Done is chrome noise on clarify turns.
  return completionSummaryHasOutcomeSignal(action);
}
