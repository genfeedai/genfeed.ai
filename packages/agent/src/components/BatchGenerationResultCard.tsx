import { AGENT_CONVERSATION_SURFACE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentUiAction,
  AgentUiActionCta,
} from '@genfeedai/agent/models/agent-chat.model';
import { normalizeAgentAppHref } from '@genfeedai/agent/utils/normalize-agent-app-href';
import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { CircleCheck, CircleX, FileText, Layers } from 'lucide-react';
import type { ReactElement } from 'react';

interface BatchGenerationResultCardProps {
  action: AgentUiAction;
}

function renderCta(cta: AgentUiActionCta, index: number): ReactElement | null {
  if (!cta.href) {
    return null;
  }

  const isPrimary = index === 0;

  const href = normalizeAgentAppHref(cta.href) ?? cta.href;

  return (
    <Button
      key={cta.label}
      asChild
      size={ButtonSize.SM}
      variant={isPrimary ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY}
      withWrapper={false}
      className="font-medium"
    >
      <a href={href}>{cta.label}</a>
    </Button>
  );
}

function resolveReviewHref(action: AgentUiAction): string | undefined {
  const reviewCta = action.ctas?.find(
    (cta) =>
      typeof cta.href === 'string' &&
      (cta.href.includes('review') || cta.label.toLowerCase().includes('view')),
  );
  return reviewCta?.href;
}

/**
 * Dense batch outcome surface — one header line + inline metrics.
 * Nested metric boxes and platform badge rows are T3 noise; drop them.
 */
export function BatchGenerationResultCard({
  action,
}: BatchGenerationResultCardProps): ReactElement {
  const totalPosts = action.batchCount ?? 0;
  const creditsUsed = action.creditsUsed ?? 0;
  const completedCount = action.completedCount;
  const failedCount = action.failedCount;
  const platformLabels = (action.platforms ?? []).map(
    (platform) => formatPlatformLabel(platform) ?? platform,
  );
  const previewItems = action.items ?? [];
  const remainingCount =
    action.remainingCount ??
    Math.max((completedCount ?? 0) - previewItems.length, 0);
  const reviewHref = resolveReviewHref(action);
  const isAllFailed = (completedCount ?? 0) === 0 && (failedCount ?? 0) > 0;
  const isPartialFail = (completedCount ?? 0) > 0 && (failedCount ?? 0) > 0;

  const metricsLine = [
    totalPosts > 0 ? `${totalPosts} requested` : null,
    completedCount != null ? `${completedCount} ready` : null,
    failedCount != null && failedCount > 0 ? `${failedCount} failed` : null,
    creditsUsed > 0 ? `${creditsUsed} credits` : null,
    platformLabels.length > 0 ? platformLabels.join(' · ') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        AGENT_CONVERSATION_SURFACE_CLASS,
        'mt-1.5 w-full min-w-0 max-w-full overflow-hidden px-3 py-2.5 text-left',
        isAllFailed && 'border-destructive/40',
      )}
      data-testid="batch-generation-result"
    >
      <div className="flex min-w-0 items-start gap-2">
        {isAllFailed ? (
          <CircleX className="mt-0.5 size-4 shrink-0 text-rose-400" />
        ) : isPartialFail ? (
          <Layers className="mt-0.5 size-4 shrink-0 text-amber-400" />
        ) : (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[13px] font-medium text-foreground">
              {action.title ||
                (isAllFailed ? 'Batch failed' : 'Batch complete')}
            </span>
            {action.status ? (
              <Badge status={action.status} className="h-5 text-[10px]" />
            ) : null}
          </div>
          {action.description ? (
            <p className="text-[12px] leading-5 text-foreground/70">
              {action.description}
            </p>
          ) : null}
          {metricsLine ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              {metricsLine}
            </p>
          ) : null}
        </div>
      </div>

      {previewItems.length > 0 ? (
        <div className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
          {previewItems.map((item) => {
            const platform =
              typeof item.platform === 'string'
                ? formatPlatformLabel(item.platform)
                : null;
            const href = reviewHref
              ? `${reviewHref}${reviewHref.includes('?') ? '&' : '?'}post=${encodeURIComponent(item.id)}`
              : undefined;

            const body = (
              <>
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/40 text-foreground/60">
                  <FileText className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-5 text-foreground">
                    {item.title}
                  </p>
                  {platform ? (
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {platform}
                    </p>
                  ) : null}
                </div>
              </>
            );

            return href ? (
              <a
                key={item.id}
                href={href}
                className="flex items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-accent/40"
              >
                {body}
              </a>
            ) : (
              <div key={item.id} className="flex items-start gap-2.5 px-1 py-1">
                {body}
              </div>
            );
          })}
          {remainingCount > 0 && reviewHref ? (
            <a
              href={reviewHref}
              className="inline-flex text-[12px] font-medium text-primary hover:underline"
            >
              +{remainingCount} more post{remainingCount === 1 ? '' : 's'} in
              review
            </a>
          ) : null}
        </div>
      ) : null}

      {action.ctas?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
          {action.ctas.map((cta, index) => renderCta(cta, index))}
        </div>
      ) : null}
    </div>
  );
}
