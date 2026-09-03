import {
  AdDetailSummaryCard,
  AdsSearchResultsCard,
  CampaignLaunchPrepCard,
} from '@genfeedai/agent/components/AdsAgentCards';
import {
  ContentPreviewCard,
  OAuthConnectCard,
  PaymentCtaCard,
} from '@genfeedai/agent/components/AgentChatMessageCards';
import { AgentCompletionSummaryCard } from '@genfeedai/agent/components/AgentCompletionSummaryCard';
import { AgentTransferProvenanceCard } from '@genfeedai/agent/components/AgentTransferProvenanceCard';
import { AiTextActionCard } from '@genfeedai/agent/components/AiTextActionCard';
import { AnalyticsSnapshotCard } from '@genfeedai/agent/components/AnalyticsSnapshotCard';
import { BatchGenerationCard } from '@genfeedai/agent/components/BatchGenerationCard';
import { BatchGenerationResultCard } from '@genfeedai/agent/components/BatchGenerationResultCard';
import { BrandCreateCard } from '@genfeedai/agent/components/BrandCreateCard';
import { BrandIdentityConfirmationCard } from '@genfeedai/agent/components/BrandIdentityConfirmationCard';
import { BrandInterviewCompleteCard } from '@genfeedai/agent/components/BrandInterviewCompleteCard';
import { BrandInterviewOfferCard } from '@genfeedai/agent/components/BrandInterviewOfferCard';
import { BrandVoiceProfileCard } from '@genfeedai/agent/components/BrandVoiceProfileCard';
import {
  CampaignControlCard,
  CampaignCreateCard,
} from '@genfeedai/agent/components/CampaignCard';
import { ClipRunCard } from '@genfeedai/agent/components/ClipRunCard';
import { ClipWorkflowRunCard } from '@genfeedai/agent/components/ClipWorkflowRunCard';
import { ContentCalendarCard } from '@genfeedai/agent/components/ContentCalendarCard';
import { CreditsBalanceCard } from '@genfeedai/agent/components/CreditsBalanceCard';
import { EngagementOpportunityCard } from '@genfeedai/agent/components/EngagementOpportunityCard';
import { GenerationActionCard } from '@genfeedai/agent/components/GenerationActionCard';
import { ImageTransformCard } from '@genfeedai/agent/components/ImageTransformCard';
import { IngredientAlternativesCard } from '@genfeedai/agent/components/IngredientAlternativesCard';
import { IngredientPickerCard } from '@genfeedai/agent/components/IngredientPickerCard';
import { LivestreamBotCard } from '@genfeedai/agent/components/LivestreamBotCard';
import { NextStepsCard } from '@genfeedai/agent/components/NextStepsCard';
import { OnboardingChecklistCard } from '@genfeedai/agent/components/OnboardingChecklistCard';
import { PublishPostCard } from '@genfeedai/agent/components/PublishPostCard';
import { ReviewGateCard } from '@genfeedai/agent/components/ReviewGateCard';
import { SchedulePostCard } from '@genfeedai/agent/components/SchedulePostCard';
import { StudioHandoffCard } from '@genfeedai/agent/components/StudioHandoffCard';
import { TrendingTopicsCard } from '@genfeedai/agent/components/TrendingTopicsCard';
import { VoiceCloneCard } from '@genfeedai/agent/components/VoiceCloneCard';
import { WorkflowCreatedCard } from '@genfeedai/agent/components/WorkflowCreatedCard';
import { WorkflowExecuteCard } from '@genfeedai/agent/components/WorkflowExecuteCard';
import { WorkflowTriggerCard } from '@genfeedai/agent/components/WorkflowTriggerCard';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

export function UiActionRenderer({
  action,
  apiService,
  isDisabled = false,
  isReadOnly = false,
  onCopy,
  onOAuthConnect,
  onBrandCreate,
  onSelectCreditPack,
  onSelectIngredient,
  onRetry,
  onUiAction,
}: {
  action: AgentUiAction;
  apiService?: AgentApiService;
  /** A live thread action is already running; keep the card visible but inert. */
  isDisabled?: boolean;
  /**
   * Archived / read-only threads: cards stay visible for reference but every
   * control (including href CTAs like Review Draft) is inert.
   */
  isReadOnly?: boolean;
  onCopy?: (content: string) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  onRetry?: () => void | Promise<void>;
  onUiAction?: AgentUiActionHandler;
}): ReactElement | null {
  const translate = useTranslations('agent.chrome');
  const isInert = isReadOnly || isDisabled;
  // Drop mutating handlers when archived or temporarily busy —
  // pointer-events-none alone is not enough for keyboard / programmatic
  // activation of nested controls.
  const liveOnCopy = isInert ? undefined : onCopy;
  const liveOnOAuthConnect = isInert ? undefined : onOAuthConnect;
  const liveOnBrandCreate = isInert ? undefined : onBrandCreate;
  const liveOnSelectCreditPack = isInert ? undefined : onSelectCreditPack;
  const liveOnSelectIngredient = isInert ? undefined : onSelectIngredient;
  const liveOnRetry = isInert ? undefined : onRetry;
  const liveOnUiAction = isInert ? undefined : onUiAction;
  // Cards that take apiService for live mutations must not receive it while
  // the thread is archived — otherwise their internal CTAs stay fully live.
  const liveApiService = isReadOnly ? undefined : apiService;

  let card: ReactElement | null = null;

  switch (action.type) {
    case 'agent_transfer_card':
      card = (
        <AgentTransferProvenanceCard
          action={action}
          apiService={liveApiService}
          onCopy={liveOnCopy}
          onUiAction={liveOnUiAction}
        />
      );
      break;
    case 'completion_summary_card':
      card = (
        <AgentCompletionSummaryCard
          action={action}
          onCopy={liveOnCopy}
          onRetry={liveOnRetry}
          onUiAction={liveOnUiAction}
        />
      );
      break;
    case 'oauth_connect_card':
      card = (
        <OAuthConnectCard action={action} onConnect={liveOnOAuthConnect} />
      );
      break;
    case 'content_preview_card':
      card = (
        <ContentPreviewCard
          action={action}
          apiService={apiService}
          onCopy={liveOnCopy}
        />
      );
      break;
    case 'payment_cta_card':
      card = (
        <PaymentCtaCard action={action} onSelect={liveOnSelectCreditPack} />
      );
      break;
    case 'generation_action_card':
      card = liveApiService ? (
        <GenerationActionCard action={action} apiService={liveApiService} />
      ) : null;
      break;
    case 'analytics_snapshot_card':
      card = <AnalyticsSnapshotCard action={action} />;
      break;
    case 'ads_search_results_card':
      card = <AdsSearchResultsCard action={action} />;
      break;
    case 'ad_detail_summary_card':
      card = <AdDetailSummaryCard action={action} />;
      break;
    case 'campaign_launch_prep_card':
      card = <CampaignLaunchPrepCard action={action} />;
      break;
    case 'publish_post_card':
      card = <PublishPostCard action={action} onUiAction={liveOnUiAction} />;
      break;
    case 'image_transform_card':
      card = <ImageTransformCard action={action} />;
      break;
    case 'outreach_sequence_create_card':
      card = <CampaignCreateCard action={action} />;
      break;
    case 'outreach_sequence_control_card':
      card = (
        <CampaignControlCard action={action} onUiAction={liveOnUiAction} />
      );
      break;
    case 'review_gate_card':
      card = <ReviewGateCard action={action} />;
      break;
    case 'ingredient_picker_card':
      card = (
        <IngredientPickerCard
          action={action}
          onSelect={liveOnSelectIngredient}
        />
      );
      break;
    case 'workflow_trigger_card':
      card = liveApiService ? (
        <WorkflowTriggerCard action={action} apiService={liveApiService} />
      ) : null;
      break;
    case 'clip_workflow_run_card':
      card = liveApiService ? (
        <ClipWorkflowRunCard action={action} apiService={liveApiService} />
      ) : null;
      break;
    case 'clip_run_card':
      card = action.clipRunState ? (
        <ClipRunCard state={action.clipRunState} />
      ) : null;
      break;
    case 'ingredient_alternatives_card':
      card = liveApiService ? (
        <IngredientAlternativesCard
          action={action}
          apiService={liveApiService}
        />
      ) : null;
      break;
    case 'next_steps_card':
      card = <NextStepsCard action={action} onUiAction={liveOnUiAction} />;
      break;
    case 'schedule_post_card':
      card = <SchedulePostCard action={action} onUiAction={liveOnUiAction} />;
      break;
    case 'engagement_opportunity_card':
      card = <EngagementOpportunityCard action={action} />;
      break;
    case 'onboarding_checklist_card':
      card = <OnboardingChecklistCard action={action} />;
      break;
    case 'credits_balance_card':
      card = <CreditsBalanceCard action={action} />;
      break;
    case 'studio_handoff_card':
      card = <StudioHandoffCard action={action} />;
      break;
    case 'brand_create_card':
      card = <BrandCreateCard action={action} onCreate={liveOnBrandCreate} />;
      break;
    case 'brand_identity_confirmation_card':
      card = (
        <BrandIdentityConfirmationCard
          action={action}
          onUiAction={
            liveOnUiAction
              ? async (actionName, payload) =>
                  (await liveOnUiAction(actionName, payload)) === true
              : undefined
          }
        />
      );
      break;
    case 'workflow_execute_card':
      card = liveApiService ? (
        <WorkflowExecuteCard action={action} apiService={liveApiService} />
      ) : null;
      break;
    case 'trending_topics_card':
      card = <TrendingTopicsCard action={action} />;
      break;
    case 'content_calendar_card':
      card = <ContentCalendarCard action={action} />;
      break;
    case 'batch_generation_card':
      card = <BatchGenerationCard action={action} />;
      break;
    case 'batch_generation_result_card':
      card = <BatchGenerationResultCard action={action} />;
      break;
    case 'voice_clone_card':
      card = liveApiService ? (
        <VoiceCloneCard action={action} apiService={liveApiService} />
      ) : null;
      break;
    case 'brand_voice_profile_card':
      card = (
        <BrandVoiceProfileCard action={action} onUiAction={liveOnUiAction} />
      );
      break;
    case 'workflow_created_card':
      card = (
        <WorkflowCreatedCard action={action} onUiAction={liveOnUiAction} />
      );
      break;
    case 'bot_created_card':
      card = <LivestreamBotCard action={action} onUiAction={liveOnUiAction} />;
      break;
    case 'livestream_bot_status_card':
      card = <LivestreamBotCard action={action} onUiAction={liveOnUiAction} />;
      break;
    case 'brand_interview_offer_card':
      card = (
        <BrandInterviewOfferCard action={action} onUiAction={liveOnUiAction} />
      );
      break;
    case 'brand_interview_complete_card':
      card = <BrandInterviewCompleteCard action={action} />;
      break;
    case 'ai_text_action_card':
      card = (
        <AiTextActionCard
          action={action}
          onApply={
            liveOnUiAction
              ? ({ text, selectedAction }) =>
                  liveOnUiAction('apply_to_draft', {
                    sourceAction: selectedAction,
                    text,
                  })
              : undefined
          }
        />
      );
      break;
    default:
      card = (
        <div
          className="border border-border bg-background-secondary p-3 text-sm text-foreground"
          role="status"
        >
          {translate('unsupportedCard')}
          {typeof action.type === 'string' ? ` (${action.type})` : ''}
        </div>
      );
      break;
  }

  if (!card) {
    return null;
  }

  // Keep this shell mounted in both live and inert states. Conditionally
  // inserting it remounts stateful cards when an action starts, which erases
  // their pending/success state before the action promise resolves.
  // `inert` blocks pointer + keyboard focus. Archived mutation cards omit
  // apiService and render null; temporarily busy cards retain it so their
  // state remains visible while their handlers stay disconnected.
  return (
    <div
      aria-disabled={isInert ? 'true' : undefined}
      className={isInert ? 'select-none opacity-60' : 'contents'}
      data-archived-readonly={isReadOnly ? 'true' : undefined}
      data-testid={
        isReadOnly
          ? 'ui-action-archived-readonly'
          : isDisabled
            ? 'ui-action-busy'
            : undefined
      }
      // React 19 supports the inert boolean attribute.
      inert={isInert}
    >
      {card}
    </div>
  );
}
