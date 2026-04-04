import type {
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionOutputVariant,
} from '@cloud/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, useMemo, useState } from 'react';
import {
  HiCheckCircle,
  HiOutlineClipboard,
  HiOutlineFaceFrown,
  HiOutlineHandThumbDown,
  HiOutlineHandThumbUp,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

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
        className="aspect-square w-full rounded-xl border border-border/60 bg-muted/20 object-cover"
      />
    );
  }

  if (variant.kind === 'video' && variant.url) {
    return (
      <video
        src={variant.url}
        controls
        aria-label={variant.title ?? 'Generated output video'}
        className="aspect-square w-full rounded-xl border border-border/60 bg-muted/20 object-cover"
      />
    );
  }

  if (variant.kind === 'text' && variant.textContent) {
    return (
      <div className="flex aspect-square flex-col justify-between rounded-xl border border-border/60 bg-background/80 p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <HiOutlineSparkles className="h-3.5 w-3.5" />
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
}: {
  cta: AgentUiActionCta;
  isPrimary?: boolean;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
}): ReactElement {
  if (cta.href) {
    return (
      <a
        href={cta.href}
        className={cn(
          'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
    <button
      type="button"
      onClick={() => {
        if (!cta.action) {
          return;
        }
        void onUiAction?.(cta.action, cta.payload);
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isPrimary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border bg-background text-foreground hover:bg-accent',
      )}
    >
      {cta.label}
    </button>
  );
}

export function AgentCompletionSummaryCard({
  action,
  onCopy,
  onRetry,
  onUiAction,
}: AgentCompletionSummaryCardProps): ReactElement {
  const [feedbackState, setFeedbackState] = useState<
    'positive' | 'negative' | null
  >(null);
  const outputVariants = (action.outputVariants ?? []).slice(0, 4);
  const copyValue = useMemo(() => {
    const summary = action.summaryText?.trim() ?? '';
    const bullets = (action.outcomeBullets ?? []).map(
      (bullet) => `- ${bullet}`,
    );
    return [summary, ...bullets].filter(Boolean).join('\n');
  }, [action.outcomeBullets, action.summaryText]);

  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <HiCheckCircle className="h-4.5 w-4.5 text-emerald-500" />
        <span>{action.title || 'Done'}</span>
      </div>

      {action.summaryText ? (
        <p className="mt-3 text-sm leading-6 text-foreground">
          {action.summaryText}
        </p>
      ) : null}

      {action.outcomeBullets?.length ? (
        <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
          {action.outcomeBullets.slice(0, 4).map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="mt-[0.4rem] h-1.5 w-1.5 rounded-full bg-primary/80" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {outputVariants.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {outputVariants.map((variant) => {
            const preview = renderOutputPreview(variant);
            if (!preview) {
              return (
                <div
                  key={variant.id}
                  className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/60 text-muted-foreground"
                >
                  {variant.kind === 'video' ? (
                    <HiOutlineVideoCamera className="h-5 w-5" />
                  ) : (
                    <HiOutlinePhoto className="h-5 w-5" />
                  )}
                </div>
              );
            }

            return <div key={variant.id}>{preview}</div>;
          })}
        </div>
      ) : null}

      {action.primaryCta ? (
        <div className="mt-5">
          <CompletionActionButton
            cta={action.primaryCta}
            isPrimary
            onUiAction={onUiAction}
          />
        </div>
      ) : null}

      {action.secondaryCtas?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {action.secondaryCtas.slice(0, 3).map((cta, index) => (
            <CompletionActionButton
              key={`${action.id}-secondary-${cta.label}-${index}`}
              cta={cta}
              onUiAction={onUiAction}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <Button
          ariaLabel="Copy result summary"
          variant={ButtonVariant.GHOST}
          className="h-8 px-2 text-xs"
          onClick={() => {
            if (!copyValue) {
              return;
            }
            void onCopy?.(copyValue);
          }}
        >
          <HiOutlineClipboard className="mr-1 h-3.5 w-3.5" />
          Copy
        </Button>
        <Button
          ariaLabel="Retry result"
          variant={ButtonVariant.GHOST}
          className="h-8 px-2 text-xs"
          onClick={() => {
            void onRetry?.();
          }}
        >
          Retry
        </Button>
        <button
          type="button"
          aria-label="Mark result helpful"
          className="inline-flex h-8 items-center gap-1 rounded px-2 transition-colors hover:bg-accent"
          onClick={() => setFeedbackState('positive')}
        >
          <HiOutlineHandThumbUp className="h-3.5 w-3.5" />
          Good
        </button>
        <button
          type="button"
          aria-label="Mark result not helpful"
          className="inline-flex h-8 items-center gap-1 rounded px-2 transition-colors hover:bg-accent"
          onClick={() => setFeedbackState('negative')}
        >
          <HiOutlineHandThumbDown className="h-3.5 w-3.5" />
          Bad
        </button>
        {feedbackState ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            {feedbackState === 'positive' ? (
              <HiCheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <HiOutlineFaceFrown className="h-3.5 w-3.5 text-amber-500" />
            )}
            Thanks for the feedback.
          </span>
        ) : null}
      </div>
    </div>
  );
}
