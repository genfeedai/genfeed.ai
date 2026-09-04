import { AgentChatMessageFooter } from '@genfeedai/agent/components/AgentChatMessageFooter';
import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import { USER_MESSAGE_COLLAPSE_MAX_HEIGHT_CLASS } from '@genfeedai/agent/constants/agent-message-collapse.constant';
import {
  AGENT_ASSISTANT_PROSE_CLASS,
  AGENT_CONVERSATION_STICKY_USER_TURN_CLASS,
  AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import { useAnimatedText } from '@genfeedai/agent/hooks/use-animated-text';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { collapseOAuthConnectCards } from '@genfeedai/agent/utils/collapse-oauth-connect-cards';
import { shouldCollapseUserMessage } from '@genfeedai/agent/utils/should-collapse-user-message';
import {
  hasProductResultCard,
  shouldRenderCompletionSummary,
} from '@genfeedai/agent/utils/should-render-completion-summary';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { memo, type ReactElement, useCallback, useMemo, useState } from 'react';

// Re-export for consumers that import UiActionRenderer from this module
export { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';

interface AgentChatMessageProps {
  message: AgentChatMessageType;
  messageIndex?: number;
  apiService?: AgentApiService;
  onCopy?: (content: string) => void | Promise<void>;
  onRetry?: (message: AgentChatMessageType) => void | Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
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
  onUiAction?: AgentUiActionHandler;
  isBusy?: boolean;
  /** Archived thread — strip mutating card actions and retry/regenerate. */
  isReadOnly?: boolean;
  messageAnchorId?: string;
  isHighlighted?: boolean;
  /** Only the user turn that owns the terminal failed run may be retried. */
  isRetryableUserPrompt?: boolean;
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

function AgentChatMessageInner({
  message,
  messageIndex = 0,
  apiService,
  onCopy,
  onRetry,
  onRegenerate,
  onOAuthConnect,
  onBrandCreate,
  onSelectCreditPack,
  onSelectIngredient,
  onUiAction,
  isBusy = false,
  isReadOnly = false,
  messageAnchorId,
  isHighlighted = false,
  isRetryableUserPrompt = false,
  onRemember,
}: AgentChatMessageProps): ReactElement {
  const isUser = message.role === 'user';
  const generatedContent = message.metadata?.generatedContent;
  const generatedContentType = message.metadata?.contentType;
  const toolCalls = message.metadata?.toolCalls;
  const metadataTransfer = message.metadata?.agentTransfer?.transfer;
  const uiActions = useMemo(() => {
    const actions = message.metadata?.uiActions ?? [];
    if (!metadataTransfer) {
      return actions;
    }
    return [
      ...actions,
      {
        data: { transfer: metadataTransfer },
        id: `agent-transfer:${metadataTransfer.id}:${metadataTransfer.direction}`,
        title: 'Conversation transfer',
        type: 'agent_transfer_card' as const,
      },
    ];
  }, [message.metadata?.uiActions, metadataTransfer]);
  const normalizedUiActions = useMemo(() => {
    if (!uiActions?.length) {
      return [];
    }

    const filtered = collapseOAuthConnectCards(
      uiActions.filter((action) => {
        // Generation configuration follows the single conversation composer.
        // The completed content_preview_card remains in the transcript.
        return action.type !== 'generation_action_card';
      }),
    );

    // Drop noise Done cards when a sibling result card already owns the turn
    // (T3/Codex density — one surface per outcome, not stacked chrome).
    return filtered.filter((action) => {
      if (action.type !== 'completion_summary_card') {
        return true;
      }
      return shouldRenderCompletionSummary(action, filtered);
    });
  }, [uiActions]);
  const completionSummaryAction =
    normalizedUiActions.find(
      (action) => action.type === 'completion_summary_card',
    ) ?? null;
  const supplementalUiActions = normalizedUiActions.filter(
    (action) => action.type !== 'completion_summary_card',
  );
  const turnHasProductResultCard = useMemo(
    () => hasProductResultCard(normalizedUiActions),
    [normalizedUiActions],
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
    Boolean(message.content) &&
    !shouldSuppressFallbackMessage &&
    !metadataTransfer;
  const copyContent =
    message.content.trim().length > 0
      ? message.content
      : (generatedContent ?? '').trim();
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncateContent =
    isUser && shouldCollapseUserMessage(message.content ?? '');
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
    if (!generatedContent || turnHasProductResultCard) {
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
  }, [generatedContent, generatedContentType, turnHasProductResultCard]);
  // Product result cards own CTAs for the turn — suppress copy/retry footers
  // that stack next to generation/review surfaces (T3 density).
  const shouldShowAssistantActions =
    !isUser &&
    (onCopy || onRetry || onRemember) &&
    !isToolOnlyFallbackMessage &&
    !completionSummaryAction &&
    !turnHasProductResultCard &&
    !shouldRenderGeneratedTextCard;
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
  const handleInsertGeneratedContent = useCallback(
    (content: string) => {
      void onUiAction?.('apply_to_draft', {
        sourceAction: 'generated_content',
        text: content,
      });
    },
    [onUiAction],
  );
  // Stabilize the entrance-animation delay object so `React.memo` sees a
  // reference-equal `style` prop across re-renders where `messageIndex`
  // hasn't changed — an inline `{ animationDelay: ... }` literal would defeat
  // memoization on every render regardless of prop equality elsewhere.
  const entranceAnimationStyle = useMemo(
    () => ({ animationDelay: `${Math.min(messageIndex * 25, 150)}ms` }),
    [messageIndex],
  );

  return (
    <div
      id={messageAnchorId}
      className={cn(
        'group mb-2 flex min-w-0 w-full scroll-mt-4 motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out',
        isUser
          ? cn(AGENT_CONVERSATION_STICKY_USER_TURN_CLASS, 'flex-col')
          : 'justify-start',
      )}
      style={entranceAnimationStyle}
    >
      <div
        data-message-role={message.role}
        data-message-surface={isUser ? 'prompt' : 'inline'}
        className={cn(
          'relative min-w-0 transition-[border-color,background-color,box-shadow] duration-300',
          isHighlighted && !isUser && SCROLL_FOCUS_SURFACE_CLASS,
          isUser
            ? AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS
            : // Free-text assistant: no card chrome — document flow like T3/chat
              'w-full max-w-full border-0 bg-transparent py-1 text-md leading-7 text-foreground shadow-none',
        )}
      >
        <h3 className="sr-only">
          {isUser ? 'Your message' : 'Assistant message'}
        </h3>

        {shouldRenderMessageContent && (
          <div
            className={cn(
              'relative overflow-hidden',
              !isExpanded &&
                shouldTruncateContent &&
                `rounded-b-xl ${USER_MESSAGE_COLLAPSE_MAX_HEIGHT_CLASS}`,
            )}
          >
            <SafeMarkdown
              content={visibleMessageContent}
              enhanceStructure={!isUser}
              className={cn(
                // min-w-0 + anywhere: long tokens / inline code must wrap inside
                // the track instead of expanding the conversation column.
                'min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-inherit',
                isUser
                  ? 'text-md leading-6 text-foreground [&_p]:my-1'
                  : AGENT_ASSISTANT_PROSE_CLASS,
              )}
            />
            {isMessageAnimating && !shouldTruncateContent ? (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-current align-middle opacity-70" />
            ) : null}
            {!isExpanded && shouldTruncateContent && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background-tertiary to-transparent" />
            )}
          </div>
        )}
        {shouldSuppressFallbackMessage && !completionSummaryAction ? (
          <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Results are ready below.
          </div>
        ) : null}
        {shouldRenderMessageContent && shouldTruncateContent && (
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            className="mt-2 text-2xs font-semibold text-primary hover:text-primary/80"
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
                className="size-10 shrink-0 overflow-hidden rounded-lg border border-border/60"
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
            onInsert={
              !isReadOnly && onUiAction
                ? handleInsertGeneratedContent
                : undefined
            }
            onRegenerate={
              !isReadOnly && onRegenerate
                ? () => onRegenerate(message)
                : undefined
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
            isDisabled={isBusy}
            isReadOnly={isReadOnly}
            onCopy={onCopy}
            onOAuthConnect={onOAuthConnect}
            onBrandCreate={onBrandCreate}
            onRetry={
              !isReadOnly && onRetry ? () => onRetry(message) : undefined
            }
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
              isDisabled={isBusy}
              isReadOnly={isReadOnly}
              onCopy={onCopy}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onRetry={
                !isReadOnly && onRetry ? () => onRetry(message) : undefined
              }
              onSelectCreditPack={onSelectCreditPack}
              onSelectIngredient={onSelectIngredient}
              onUiAction={onUiAction}
            />
          ))}

        {isUser ? null : (
          <AgentChatMessageFooter
            isUser={isUser}
            metaItems={metaItems}
            shouldShowAssistantActions={Boolean(shouldShowAssistantActions)}
            isBusy={isBusy || isReadOnly}
            copyContent={copyContent}
            message={message}
            onCopy={onCopy}
            onRetry={undefined}
            onRemember={isReadOnly ? undefined : onRemember}
          />
        )}
      </div>
      {isUser ? (
        <AgentChatMessageFooter
          isUser
          metaItems={metaItems}
          shouldShowAssistantActions={false}
          isBusy={isBusy || isReadOnly}
          copyContent={copyContent}
          message={message}
          onCopy={onCopy}
          onRetry={!isReadOnly && isRetryableUserPrompt ? onRetry : undefined}
          onRemember={undefined}
        />
      ) : null}
    </div>
  );
}

export const AgentChatMessage = memo(AgentChatMessageInner);
