import type {
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionOutputVariant,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  ChevronDown,
  ChevronUp,
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
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
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
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
  size?: 'default' | 'compact';
}): ReactElement {
  const sizeClass =
    size === 'compact' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm';

  if (cta.href) {
    return (
      <a
        href={cta.href}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors',
          sizeClass,
          isPrimary
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-border bg-background text-foreground hover:bg-accent',
        )}
      >
        {cta.label}
      </a>
    );
  }

  return (
    <Button
      variant={isPrimary ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY}
      withWrapper={false}
      onClick={() => {
        if (!cta.action) {
          return;
        }
        void onUiAction?.(cta.action, cta.payload);
      }}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        sizeClass,
      )}
    >
      {cta.label}
    </Button>
  );
}

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

  // Compact by default — expand only when the user wants detail.
  // Media previews still default open so assets aren't hidden.
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

  return (
    <div className="mt-2 border border-border/70 bg-card/70 text-left shadow-sm backdrop-blur-sm">
      {/* Always-visible compact header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <CircleCheck className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {action.title || 'Done'}
            </span>
            {!isExpanded && oneLiner ? (
              <span className="truncate text-xs text-muted-foreground">
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
          <Button
            ariaLabel={isExpanded ? 'Collapse summary' : 'Expand summary'}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            onClick={() => setIsExpanded((open) => !open)}
          >
            {isExpanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-2">
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
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
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
      ) : null}
    </div>
  );
}
