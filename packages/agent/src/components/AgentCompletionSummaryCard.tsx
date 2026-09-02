import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import {
  AGENT_CONVERSATION_INLINE_ROW_CLASS,
  AGENT_CONVERSATION_SURFACE_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionHandler,
  AgentUiActionOutputVariant,
} from '@genfeedai/agent/models/agent-chat.model';
import { normalizeAgentAppHref } from '@genfeedai/agent/utils/normalize-agent-app-href';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  CircleCheck,
  Clipboard,
  Frown,
  Image,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Video,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

interface AgentCompletionSummaryCardProps {
  action: AgentUiAction;
  onCopy?: (content: string) => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onUiAction?: AgentUiActionHandler;
}

function renderOutputPreview(
  variant: AgentUiActionOutputVariant,
): ReactElement | null {
  if (variant.kind === 'image' && variant.url) {
    return (
      <img
        src={variant.url}
        alt={variant.title ?? 'Generated output'}
        className="aspect-square w-full border border-border/60 bg-muted/20 object-cover"
      />
    );
  }

  if (variant.kind === 'video' && variant.url) {
    return (
      <video
        src={variant.url}
        controls
        aria-label={variant.title ?? 'Generated output video'}
        className="aspect-square w-full border border-border/60 bg-muted/20 object-cover"
      >
        <track kind="captions" />
      </video>
    );
  }

  if (variant.kind === 'text' && variant.textContent) {
    return (
      <div className="flex aspect-square flex-col justify-between border border-border/60 bg-background/80 p-3">
        <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Sparkles className="size-3.5" />
          {variant.title ?? 'Text'}
        </div>
        <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-5 text-foreground/85">
          {variant.textContent}
        </p>
      </div>
    );
  }

  return null;
}

function CompletionActionButton({
  cta,
  isPrimary = false,
  onUiAction,
  size = 'default',
}: {
  cta: AgentUiActionCta;
  isPrimary?: boolean;
  onUiAction?: AgentUiActionHandler;
  size?: 'default' | 'compact';
}): ReactElement {
  // Always go through Button so global `a { color }` rules cannot paint
  // black text on dark card chrome (raw anchors were unreadable).
  const buttonSize = size === 'compact' ? ButtonSize.SM : ButtonSize.DEFAULT;
  const variant = isPrimary ? ButtonVariant.SECONDARY : ButtonVariant.GHOST;
  const className = cn(
    'shrink-0 font-medium text-foreground',
    size === 'compact' && 'h-7 px-2.5 text-xs',
  );

  if (cta.href) {
    const href = normalizeAgentAppHref(cta.href) ?? cta.href;
    return (
      <Button
        asChild
        size={buttonSize}
        variant={variant}
        withWrapper={false}
        className={className}
      >
        <a href={href}>{cta.label}</a>
      </Button>
    );
  }

  return (
    <Button
      size={buttonSize}
      variant={variant}
      withWrapper={false}
      onClick={() => {
        if (!cta.action) {
          return;
        }
        void onUiAction?.(cta.action, cta.payload);
      }}
      className={className}
    >
      {cta.label}
    </Button>
  );
}

/**
 * T3/Codex density: default is a single inline status row (no card shell).
 * Expands to a bordered surface only when there are media previews or detail.
 */
export function AgentCompletionSummaryCard({
  action,
  onCopy,
  onRetry,
  onUiAction,
}: AgentCompletionSummaryCardProps): ReactElement {
  const outputVariants = (action.outputVariants ?? []).slice(0, 4);
  const hasRichBody =
    outputVariants.length > 0 ||
    Boolean(action.summaryText?.trim()) ||
    (action.outcomeBullets?.length ?? 0) > 0 ||
    Boolean(action.secondaryCtas?.length);

  // Media previews open by default; text-only stays collapsed (one-line row).
  const [isExpanded, setIsExpanded] = useState(outputVariants.length > 0);
  const [feedbackState, setFeedbackState] = useState<
    'positive' | 'negative' | null
  >(null);

  const copyValue = useMemo(() => {
    const summary = action.summaryText?.trim() ?? '';
    const bullets = (action.outcomeBullets ?? []).map(
      (bullet) => `- ${bullet}`,
    );
    return [summary, ...bullets].filter(Boolean).join('\n');
  }, [action.outcomeBullets, action.summaryText]);

  const oneLiner =
    action.summaryText?.trim() ||
    action.outcomeBullets?.[0] ||
    action.description?.trim() ||
    '';

  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <CircleCheck className="size-3.5 shrink-0 text-emerald-500" />
      <div className="min-w-0 flex-1 basis-32">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground/90">
            {action.title || 'Done'}
          </span>
          {!isExpanded && oneLiner ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              · {oneLiner}
            </span>
          ) : null}
        </div>
      </div>

      {action.primaryCta ? (
        <CompletionActionButton
          cta={action.primaryCta}
          isPrimary
          size="compact"
          onUiAction={onUiAction}
        />
      ) : null}

      {hasRichBody ? (
        <AgentCardCollapseToggle
          isCollapsed={!isExpanded}
          labelCollapse="Collapse summary"
          labelExpand="Expand summary"
          onToggle={() => {
            setIsExpanded((open) => !open);
          }}
        />
      ) : null}
    </div>
  );

  // Collapsed / no-detail: borderless inline row (Codex density).
  if (!isExpanded) {
    return (
      <div
        className={AGENT_CONVERSATION_INLINE_ROW_CLASS}
        data-testid="agent-completion-summary"
      >
        {header}
      </div>
    );
  }

  return (
    <div
      className={cn(
        AGENT_CONVERSATION_SURFACE_CLASS,
        'mt-1.5 w-full min-w-0 max-w-full overflow-hidden text-left',
      )}
      data-testid="agent-completion-summary"
    >
      <div className="px-3 py-2">{header}</div>

      <div className="space-y-2.5 border-t border-border/50 px-3 pb-2.5 pt-2">
        {action.summaryText ? (
          <p className="text-sm leading-5 text-foreground/90">
            {action.summaryText}
          </p>
        ) : null}

        {action.outcomeBullets?.length ? (
          <ul className="space-y-1 text-sm text-foreground/80">
            {action.outcomeBullets.slice(0, 4).map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-primary/80" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {outputVariants.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {outputVariants.map((variant) => {
              const preview = renderOutputPreview(variant);
              if (!preview) {
                return (
                  <div
                    key={variant.id}
                    className="flex aspect-square items-center justify-center border border-dashed border-border/60 bg-background/60 text-muted-foreground"
                  >
                    {variant.kind === 'video' ? (
                      <Video className="size-5" />
                    ) : (
                      <Image className="size-5" />
                    )}
                  </div>
                );
              }

              return <div key={variant.id}>{preview}</div>;
            })}
          </div>
        ) : null}

        {action.secondaryCtas?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {action.secondaryCtas.slice(0, 3).map((cta, index) => (
              <CompletionActionButton
                key={`${action.id}-secondary-${cta.label}-${index}`}
                cta={cta}
                size="compact"
                onUiAction={onUiAction}
              />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
          <Button
            ariaLabel="Copy result summary"
            variant={ButtonVariant.GHOST}
            className="h-7 px-2 text-xs"
            onClick={() => {
              if (!copyValue) {
                return;
              }
              void onCopy?.(copyValue);
            }}
          >
            <Clipboard className="mr-1 size-3.5" />
            Copy
          </Button>
          <Button
            ariaLabel="Retry result"
            variant={ButtonVariant.GHOST}
            className="h-7 px-2 text-xs"
            onClick={() => {
              void onRetry?.();
            }}
          >
            Retry
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            ariaLabel="Mark result helpful"
            className="h-7 px-2 text-xs"
            onClick={() => setFeedbackState('positive')}
          >
            <ThumbsUp className="mr-1 size-3.5" />
            Good
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            ariaLabel="Mark result not helpful"
            className="h-7 px-2 text-xs"
            onClick={() => setFeedbackState('negative')}
          >
            <ThumbsDown className="mr-1 size-3.5" />
            Bad
          </Button>
          {feedbackState ? (
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground/80">
              {feedbackState === 'positive' ? (
                <CircleCheck className="size-3.5 text-emerald-500" />
              ) : (
                <Frown className="size-3.5 text-amber-500" />
              )}
              Thanks for the feedback.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
