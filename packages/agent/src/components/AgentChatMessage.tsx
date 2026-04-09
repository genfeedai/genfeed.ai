import {
  AdDetailSummaryCard,
  AdsSearchResultsCard,
  CampaignLaunchPrepCard,
} from '@genfeedai/agent/components/AdsAgentCards';
import { AgentCompletionSummaryCard } from '@genfeedai/agent/components/AgentCompletionSummaryCard';
import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
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
import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { SchedulePostCard } from '@genfeedai/agent/components/SchedulePostCard';
import { StudioHandoffCard } from '@genfeedai/agent/components/StudioHandoffCard';
import { TrendingTopicsCard } from '@genfeedai/agent/components/TrendingTopicsCard';
import { VoiceCloneCard } from '@genfeedai/agent/components/VoiceCloneCard';
import { WorkflowCreatedCard } from '@genfeedai/agent/components/WorkflowCreatedCard';
import { WorkflowExecuteCard } from '@genfeedai/agent/components/WorkflowExecuteCard';
import { WorkflowTriggerCard } from '@genfeedai/agent/components/WorkflowTriggerCard';
import { useAnimatedText } from '@genfeedai/agent/hooks/use-animated-text';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button, buttonVariants } from '@ui/primitives/button';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineClipboard,
  HiOutlineClock,
  HiSparkles,
} from 'react-icons/hi2';

interface AgentChatMessageProps {
  message: AgentChatMessageType;
  messageIndex?: number;
  apiService?: AgentApiService;
  onCopy?: (content: string) => void | Promise<void>;
  onRetry?: (message: AgentChatMessageType) => void | Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
  isBusy?: boolean;
  messageAnchorId?: string;
  isHighlighted?: boolean;
  onRemember?: (message: AgentChatMessageType) => void;
}

const ASSISTANT_TEXT_ANIMATION_WINDOW_MS = 15_000;

function shouldAnimateAssistantMessageContent(
  createdAt: string,
  content: string,
): boolean {
  if (!content.trim()) {
    return false;
  }

  if (content.includes('```')) {
    return false;
  }

  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) {
    return false;
  }

  return Date.now() - createdAtMs < ASSISTANT_TEXT_ANIMATION_WINDOW_MS;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPlatformLabel(platform: string): string {
  const normalized = platform.trim().toLowerCase();

  switch (normalized) {
    case 'x':
    case 'twitter':
      return 'X (Twitter)';
    case 'linkedin':
      return 'LinkedIn';
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
}

function GenericOAuthConnectCard({
  action,
}: {
  action: AgentUiAction;
}): ReactElement {
  const description =
    action.description ??
    'Connect Instagram, X, LinkedIn, TikTok, YouTube, or another supported platform to continue.';
  const integrationHref =
    action.ctas?.find((cta) => cta.href)?.href ??
    '/settings/organization/credentials';

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-sm font-medium text-foreground">
        {action.title || 'Choose an integration'}
      </p>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <a
        href={integrationHref}
        className={cn(
          buttonVariants({
            size: ButtonSize.SM,
            variant: ButtonVariant.DEFAULT,
          }),
          'inline-flex w-fit',
        )}
      >
        Open integrations
      </a>
    </div>
  );
}

function OAuthConnectCard({
  action,
  onConnect,
}: {
  action: AgentUiAction;
  onConnect?: (platform: string) => void;
}): ReactElement {
  const platform = action.platform?.trim();

  if (!platform) {
    return <GenericOAuthConnectCard action={action} />;
  }

  const label = formatPlatformLabel(platform);

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-sm font-medium text-foreground">
        Connect {label}
      </p>
      <Button
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.SM}
        onClick={() => onConnect?.(platform)}
      >
        Connect {label}
      </Button>
    </div>
  );
}

function ImageWithSkeleton({
  src,
  alt,
}: {
  src: string;
  alt: string;
}): ReactElement {
  const [isLoaded, setIsLoaded] = useState(false);
  const handleLoad = useCallback(() => setIsLoaded(true), []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      {!isLoaded && (
        <div className="aspect-square w-full animate-pulse bg-muted" />
      )}
      <img
        src={src}
        alt={alt}
        className={`aspect-square w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0'}`}
        onLoad={handleLoad}
      />
    </div>
  );
}

function ContentPreviewCard({
  action,
  onCopy,
}: {
  action: AgentUiAction;
  onCopy?: (content: string) => void | Promise<void>;
}): ReactElement {
  const hasNoMedia =
    (!action.images || action.images.length === 0) &&
    (!action.videos || action.videos.length === 0) &&
    (!action.audio || action.audio.length === 0) &&
    (!action.tweets || action.tweets.length === 0);

  return (
    <div className="mt-2 space-y-2">
      {action.tweets?.map((tweet, i) => (
        <AgentGeneratedTextCard
          key={tweet}
          title={`Tweet ${i + 1}`}
          content={tweet}
          onCopy={onCopy}
        />
      ))}
      {action.images && action.images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {action.images.map((url, i) => (
            <ImageWithSkeleton
              key={url}
              src={url}
              alt={`Generated content ${i + 1}`}
            />
          ))}
        </div>
      )}
      {/* Skeleton placeholder when card has no media yet (processing state) */}
      {hasNoMedia && action.title?.toLowerCase().includes('processing') && (
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square w-full animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}
      {action.videos && action.videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {action.videos.map((url) => (
            <div
              key={url}
              className="overflow-hidden rounded-lg border border-border"
            >
              <video src={url} controls className="w-full">
                <track kind="captions" />
              </video>
            </div>
          ))}
        </div>
      )}
      {action.audio && action.audio.length > 0 && (
        <div className="space-y-2">
          {action.audio.map((url) => (
            <audio key={url} src={url} controls className="w-full">
              <track kind="captions" />
            </audio>
          ))}
        </div>
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta, index) =>
            cta.href ? (
              <a
                key={`${action.id}-content-preview-cta-${index}`}
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {cta.label}
              </a>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function PaymentCtaCard({
  action,
  onSelect,
}: {
  action: AgentUiAction;
  onSelect?: (pack: { label: string; price: string; credits: number }) => void;
}): ReactElement {
  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-background p-3">
      <p className="mb-3 text-sm font-medium text-foreground">
        Unlock more with credits
      </p>
      <div className="grid grid-cols-3 gap-2">
        {action.packs?.map((pack) => (
          <Button
            key={pack.label}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onSelect?.(pack)}
            className="rounded-lg border border-border p-2 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <p className="text-xs font-medium text-foreground">{pack.label}</p>
            <p className="text-lg font-bold text-primary">{pack.price}</p>
            <p className="text-[10px] text-muted-foreground">
              {pack.credits} credits
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
}

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
      return <AiTextActionCard action={action} />;
    default:
      return null;
  }
}

export function AgentChatMessage({
  message,
  messageIndex = 0,
  apiService,
  onCopy,
  onRetry,
  onRegenerate,
  onOAuthConnect,
  onSelectCreditPack,
  onSelectIngredient,
  onUiAction,
  isBusy = false,
  messageAnchorId,
  isHighlighted = false,
  onRemember,
}: AgentChatMessageProps): ReactElement {
  const isUser = message.role === 'user';
  const generatedContent = message.metadata?.generatedContent;
  const generatedContentType = message.metadata?.contentType;
  const toolCalls = message.metadata?.toolCalls;
  const uiActions = message.metadata?.uiActions;
  const normalizedUiActions = useMemo(() => {
    if (!uiActions?.length) {
      return [];
    }

    let genericOAuthCardRendered = false;

    return uiActions.filter((action) => {
      const isGenericOAuthCard =
        action.type === 'oauth_connect_card' && !action.platform?.trim().length;

      if (!isGenericOAuthCard) {
        return true;
      }

      if (genericOAuthCardRendered) {
        return false;
      }

      genericOAuthCardRendered = true;
      return true;
    });
  }, [uiActions]);
  const completionSummaryAction =
    normalizedUiActions.find(
      (action) => action.type === 'completion_summary_card',
    ) ?? null;
  const supplementalUiActions = normalizedUiActions.filter(
    (action) => action.type !== 'completion_summary_card',
  );
  const userAttachments = message.metadata?.attachments;
  const isFallbackContent = message.metadata?.isFallbackContent === true;
  const isToolOnlyFallbackMessage =
    isFallbackContent &&
    ((toolCalls?.length ?? 0) > 0 || normalizedUiActions.length > 0) &&
    !generatedContent;
  const hasUiActions = normalizedUiActions.length > 0;
  const shouldSuppressFallbackMessage =
    !isUser && hasUiActions && isToolOnlyFallbackMessage;
  const shouldRenderMessageContent =
    Boolean(message.content) && !shouldSuppressFallbackMessage;
  const shouldShowAssistantActions =
    !isUser &&
    (onCopy || onRetry || onRemember) &&
    !isToolOnlyFallbackMessage &&
    !completionSummaryAction;
  const copyContent =
    message.content.trim().length > 0
      ? message.content
      : (generatedContent ?? '').trim();
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncateContent = isUser && (message.content ?? '').length > 500;
  const generatedContentTitle = useMemo<string>(() => {
    const normalizedType = generatedContentType?.trim().toLowerCase();
    if (!normalizedType) {
      return 'Generated Content';
    }
    if (normalizedType === 'post') {
      return 'Generated Post';
    }
    if (normalizedType === 'article') {
      return 'Generated Article';
    }
    if (normalizedType === 'text') {
      return 'Generated Text';
    }
    return `Generated ${normalizedType.charAt(0).toUpperCase()}${normalizedType.slice(1)}`;
  }, [generatedContentType]);
  const shouldRenderGeneratedTextCard = useMemo(() => {
    if (!generatedContent) {
      return false;
    }
    const normalizedType = generatedContentType?.trim().toLowerCase();
    if (!normalizedType) {
      return true;
    }
    return ![
      'audio',
      'image',
      'images',
      'media',
      'music',
      'video',
      'videos',
    ].includes(normalizedType);
  }, [generatedContent, generatedContentType]);
  const metaItems = useMemo(() => {
    return [formatTime(message.createdAt)];
  }, [message.createdAt]);
  const shouldAnimateAssistantText = useMemo(
    () =>
      !isUser &&
      shouldRenderMessageContent &&
      shouldAnimateAssistantMessageContent(message.createdAt, message.content),
    [isUser, message.content, message.createdAt, shouldRenderMessageContent],
  );
  const {
    displayedText: animatedMessageContent,
    isAnimating: isMessageAnimating,
  } = useAnimatedText(message.content, {
    animate: shouldAnimateAssistantText,
    charsPerTick: 1,
    intervalMs: 10,
  });
  const visibleMessageContent = shouldAnimateAssistantText
    ? animatedMessageContent
    : message.content;

  return (
    <div
      id={messageAnchorId}
      className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'} motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out`}
      style={{
        animationDelay: `${Math.min(messageIndex * 25, 150)}ms`,
      }}
    >
      <div
        data-message-role={message.role}
        data-message-surface={isUser ? 'bubble' : 'inline'}
        className={cn(
          'group relative text-sm transition-shadow duration-700',
          isHighlighted && SCROLL_FOCUS_SURFACE_CLASS,
          isUser
            ? 'max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground'
            : 'w-full max-w-none rounded-none border-l border-white/[0.08] bg-transparent py-1 pl-4 pr-0 text-foreground md:pl-5',
        )}
      >
        {shouldRenderMessageContent && (
          <div
            className={cn(
              'relative overflow-hidden rounded-sm',
              !isExpanded && shouldTruncateContent && 'rounded-b-xl',
            )}
            style={{
              maxHeight: !isExpanded && shouldTruncateContent ? 200 : undefined,
            }}
          >
            <SafeMarkdown
              content={visibleMessageContent}
              className={cn(
                'prose prose-sm max-w-none break-words text-inherit prose-headings:text-inherit prose-p:text-inherit prose-strong:text-inherit prose-li:text-inherit prose-code:text-inherit prose-pre:bg-transparent',
                !isUser &&
                  'prose-p:my-2.5 prose-p:leading-7 prose-headings:mb-3 prose-headings:mt-5 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-7 prose-pre:px-0 prose-pre:py-0',
              )}
            />
            {isMessageAnimating && !shouldTruncateContent ? (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-current align-middle opacity-70" />
            ) : null}
            {!isExpanded && shouldTruncateContent && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/90 to-transparent" />
            )}
          </div>
        )}
        {shouldSuppressFallbackMessage && !completionSummaryAction ? (
          <div className="rounded border border-white/[0.08] bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
            Results are ready below.
          </div>
        ) : null}
        {shouldRenderMessageContent && shouldTruncateContent && (
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            className="mt-2 text-[10px] font-semibold text-primary hover:text-primary/80"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </Button>
        )}

        {isUser && userAttachments && userAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {userAttachments.map((attachment) => (
              <div
                key={attachment.ingredientId}
                className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10"
              >
                <img
                  src={attachment.url}
                  alt={attachment.name ?? 'Attached image'}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {shouldRenderGeneratedTextCard && (
          <AgentGeneratedTextCard
            title={generatedContentTitle}
            content={generatedContent ?? ''}
            onCopy={onCopy}
            onRegenerate={
              onRegenerate ? () => onRegenerate(message) : undefined
            }
            isBusy={isBusy}
          />
        )}

        {/* UI action cards from tool results */}
        {completionSummaryAction ? (
          <UiActionRenderer
            key={`ui-action-${completionSummaryAction.id}`}
            action={completionSummaryAction}
            apiService={apiService}
            onCopy={onCopy}
            onOAuthConnect={onOAuthConnect}
            onRetry={onRetry ? () => onRetry(message) : undefined}
            onSelectCreditPack={onSelectCreditPack}
            onSelectIngredient={onSelectIngredient}
            onUiAction={onUiAction}
          />
        ) : null}

        {supplementalUiActions.length > 0 &&
          supplementalUiActions.map((action) => (
            <UiActionRenderer
              key={`ui-action-${action.id}`}
              action={action}
              apiService={apiService}
              onCopy={onCopy}
              onOAuthConnect={onOAuthConnect}
              onRetry={onRetry ? () => onRetry(message) : undefined}
              onSelectCreditPack={onSelectCreditPack}
              onSelectIngredient={onSelectIngredient}
              onUiAction={onUiAction}
            />
          ))}

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
          <div
            className={cn(
              'flex items-center gap-1.5',
              isUser ? 'text-primary-foreground/60' : 'text-foreground/42',
            )}
          >
            {!isUser && <HiOutlineClock className="h-3 w-3" />}
            {metaItems.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="inline-flex items-center"
              >
                {index > 0 ? (
                  <span className="mr-1.5 text-foreground/30">•</span>
                ) : null}
                {index === 0 ? <time>{item}</time> : item}
              </span>
            ))}
          </div>
          {!isUser && shouldShowAssistantActions ? (
            <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {shouldShowAssistantActions && onCopy ? (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy || copyContent.length === 0}
                  tooltip="Copy"
                  tooltipPosition="top"
                  ariaLabel="Copy message"
                  onClick={() => onCopy(copyContent)}
                >
                  <HiOutlineClipboard className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {shouldShowAssistantActions && onRetry ? (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy}
                  tooltip="Retry"
                  tooltipPosition="top"
                  ariaLabel="Retry message"
                  onClick={() => onRetry(message)}
                >
                  <HiOutlineArrowPath className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {shouldShowAssistantActions && onRemember ? (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy}
                  tooltip="Remember this message"
                  tooltipPosition="top"
                  ariaLabel="Remember message"
                  onClick={() => onRemember(message)}
                >
                  <HiSparkles className="h-3.5 w-3.5 text-purple-300" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
