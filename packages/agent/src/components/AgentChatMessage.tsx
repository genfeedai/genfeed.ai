import { AgentChatMessageFooter } from '@genfeedai/agent/components/AgentChatMessageFooter';
import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import { useAnimatedText } from '@genfeedai/agent/hooks/use-animated-text';
import type { AgentChatMessage as AgentChatMessageType } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

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

export function AgentChatMessage({
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
  const handleInsertGeneratedContent = useCallback(
    (content: string) => {
      void onUiAction?.('apply_to_draft', {
        sourceAction: 'generated_content',
        text: content,
      });
    },
    [onUiAction],
  );

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
          'group relative overflow-hidden border text-sm transition-[border-color,background-color,box-shadow] duration-300',
          isHighlighted && SCROLL_FOCUS_SURFACE_CLASS,
          isUser
            ? 'max-w-[82%] rounded-md border-border/70 bg-background/78 px-4 py-3 text-foreground shadow-[0_1px_0_rgba(0,0,0,0.18)]'
            : 'w-full max-w-none rounded-md border-border/65 bg-background-secondary/72 px-4 py-3 text-foreground shadow-[0_1px_0_rgba(0,0,0,0.18)]',
        )}
      >
        <div
          aria-label={isUser ? 'Your message' : 'Assistant message'}
          className={cn(
            'mb-2.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em]',
            isUser ? 'text-foreground/38' : 'text-foreground/44',
          )}
          role="heading"
          aria-level={3}
        >
          <span>{isUser ? 'You' : 'Assistant'}</span>
          {!isUser && (toolCalls?.length ?? 0) > 0 ? (
            <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[9px] tracking-[0.12em] text-foreground/52">
              {toolCalls?.length} tool
              {(toolCalls?.length ?? 0) === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {shouldRenderMessageContent && (
          <div
            className={cn(
              'relative overflow-hidden rounded-lg',
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
                  'prose-p:my-2 prose-p:leading-6 prose-headings:mb-3 prose-headings:mt-5 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-6 prose-pre:px-0 prose-pre:py-0',
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
          <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
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
            onInsert={onUiAction ? handleInsertGeneratedContent : undefined}
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
            onBrandCreate={onBrandCreate}
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
              onBrandCreate={onBrandCreate}
              onRetry={onRetry ? () => onRetry(message) : undefined}
              onSelectCreditPack={onSelectCreditPack}
              onSelectIngredient={onSelectIngredient}
              onUiAction={onUiAction}
            />
          ))}

        <AgentChatMessageFooter
          isUser={isUser}
          metaItems={metaItems}
          shouldShowAssistantActions={Boolean(shouldShowAssistantActions)}
          isBusy={isBusy}
          copyContent={copyContent}
          message={message}
          onCopy={onCopy}
          onRetry={onRetry}
          onRemember={onRemember}
        />
      </div>
    </div>
  );
}
