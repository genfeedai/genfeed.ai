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
import { AiTextActionCard } from '@genfeedai/agent/components/AiTextActionCard';
import { AnalyticsSnapshotCard } from '@genfeedai/agent/components/AnalyticsSnapshotCard';
import { BatchGenerationCard } from '@genfeedai/agent/components/BatchGenerationCard';
import { BatchGenerationResultCard } from '@genfeedai/agent/components/BatchGenerationResultCard';
import { BrandCreateCard } from '@genfeedai/agent/components/BrandCreateCard';
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
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ReactElement } from 'react';

export function UiActionRenderer({
  action,
  apiService,
  onCopy,
  onOAuthConnect,
  onSelectCreditPack,
  onSelectIngredient,
  onRetry,
  onUiAction,
}: {
  action: AgentUiAction;
  apiService?: AgentApiService;
  onCopy?: (content: string) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  onRetry?: () => void | Promise<void>;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
}): ReactElement | null {
  switch (action.type) {
    case 'completion_summary_card':
      return (
        <AgentCompletionSummaryCard
          action={action}
          onCopy={onCopy}
          onRetry={onRetry}
          onUiAction={onUiAction}
        />
      );
    case 'oauth_connect_card':
      return <OAuthConnectCard action={action} onConnect={onOAuthConnect} />;
    case 'content_preview_card':
      return <ContentPreviewCard action={action} onCopy={onCopy} />;
    case 'payment_cta_card':
      return <PaymentCtaCard action={action} onSelect={onSelectCreditPack} />;
    case 'generation_action_card':
      return apiService ? (
        <GenerationActionCard action={action} apiService={apiService} />
      ) : null;
    case 'analytics_snapshot_card':
      return <AnalyticsSnapshotCard action={action} />;
    case 'ads_search_results_card':
      return <AdsSearchResultsCard action={action} />;
    case 'ad_detail_summary_card':
      return <AdDetailSummaryCard action={action} />;
    case 'campaign_launch_prep_card':
      return <CampaignLaunchPrepCard action={action} />;
    case 'publish_post_card':
      return <PublishPostCard action={action} onUiAction={onUiAction} />;
    case 'image_transform_card':
      return <ImageTransformCard action={action} />;
    case 'campaign_create_card':
      return <CampaignCreateCard action={action} />;
    case 'campaign_control_card':
      return <CampaignControlCard action={action} />;
    case 'review_gate_card':
      return <ReviewGateCard action={action} />;
    case 'ingredient_picker_card':
      return (
        <IngredientPickerCard action={action} onSelect={onSelectIngredient} />
      );
    case 'workflow_trigger_card':
      return apiService ? (
        <WorkflowTriggerCard action={action} apiService={apiService} />
      ) : null;
    case 'clip_workflow_run_card':
      return apiService ? (
        <ClipWorkflowRunCard action={action} apiService={apiService} />
      ) : null;
    case 'clip_run_card':
      return action.clipRunState ? (
        <ClipRunCard state={action.clipRunState} />
      ) : null;
    case 'ingredient_alternatives_card':
      return apiService ? (
        <IngredientAlternativesCard action={action} apiService={apiService} />
      ) : null;
    case 'schedule_post_card':
      return <SchedulePostCard action={action} />;
    case 'engagement_opportunity_card':
      return <EngagementOpportunityCard action={action} />;
    case 'onboarding_checklist_card':
      return <OnboardingChecklistCard action={action} />;
    case 'credits_balance_card':
      return <CreditsBalanceCard action={action} />;
    case 'studio_handoff_card':
      return <StudioHandoffCard action={action} />;
    case 'brand_create_card':
      return <BrandCreateCard action={action} />;
    case 'workflow_execute_card':
      return apiService ? (
        <WorkflowExecuteCard action={action} apiService={apiService} />
      ) : null;
    case 'trending_topics_card':
      return <TrendingTopicsCard action={action} />;
    case 'content_calendar_card':
      return <ContentCalendarCard action={action} />;
    case 'batch_generation_card':
      return <BatchGenerationCard action={action} />;
    case 'batch_generation_result_card':
      return <BatchGenerationResultCard action={action} />;
    case 'voice_clone_card':
      return apiService ? (
        <VoiceCloneCard action={action} apiService={apiService} />
      ) : null;
    case 'brand_voice_profile_card':
      return <BrandVoiceProfileCard action={action} onUiAction={onUiAction} />;
    case 'workflow_created_card':
      return <WorkflowCreatedCard action={action} onUiAction={onUiAction} />;
    case 'bot_created_card':
      return <LivestreamBotCard action={action} onUiAction={onUiAction} />;
    case 'livestream_bot_status_card':
      return <LivestreamBotCard action={action} onUiAction={onUiAction} />;
    case 'ai_text_action_card':
      return (
        <AiTextActionCard
          action={action}
          onApply={({ text, selectedAction }) =>
            onUiAction?.('apply_to_draft', {
              sourceAction: selectedAction,
              text,
            })
          }
        />
      );
    default:
      return null;
  }
}
