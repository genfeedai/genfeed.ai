'use client';

import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
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
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import { CircleCheck, CircleX, Layers } from 'lucide-react';
import { type ReactElement, useState } from 'react';

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
 * Dense batch outcome surface — header metrics + Publish-style platform
 * previews for the first drafts (same PlatformPreview as review queue).
 * Collapsible body matches completion-summary density.
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
  const hasCollapsibleBody =
    previewItems.length > 0 ||
    Boolean(action.ctas?.length) ||
    Boolean(action.description?.trim()) ||
    Boolean(
      totalPosts > 0 ||
        completedCount != null ||
        (failedCount != null && failedCount > 0) ||
        creditsUsed > 0 ||
        platformLabels.length > 0,
    );

  // Previews open by default so drafts are visible; operator can collapse.
  const [isCollapsed, setIsCollapsed] = useState(false);

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
        'mt-1.5 w-full min-w-0 max-w-full overflow-hidden text-left',
        isAllFailed && 'border-destructive/40',
      )}
      data-testid="batch-generation-result"
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        {isAllFailed ? (
          <CircleX className="size-4 shrink-0 text-rose-400" />
        ) : isPartialFail ? (
          <Layers className="size-4 shrink-0 text-warning" />
        ) : (
          <CircleCheck className="size-4 shrink-0 text-success" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {action.title ||
                (isAllFailed ? 'Batch failed' : 'Batch complete')}
            </span>
            {action.status ? (
              <Badge status={action.status} className="h-5 text-2xs" />
            ) : null}
          </div>
          {isCollapsed && (action.description || metricsLine) ? (
            <p className="truncate text-xs leading-5 text-foreground/70">
              {action.description?.trim() || metricsLine}
            </p>
          ) : null}
        </div>
        {hasCollapsibleBody ? (
          <AgentCardCollapseToggle
            isCollapsed={isCollapsed}
            labelCollapse="Collapse batch result"
            labelExpand="Expand batch result"
            onToggle={() => {
              setIsCollapsed((current) => !current);
            }}
          />
        ) : null}
      </div>

      {!isCollapsed ? (
        <div className="space-y-2.5 border-t border-border/50 px-3 pb-2.5 pt-2.5">
          {action.description ? (
            <p className="text-xs leading-5 text-foreground/70">
              {action.description}
            </p>
          ) : null}
          {metricsLine ? (
            <p className="text-2xs leading-4 text-muted-foreground">
              {metricsLine}
            </p>
          ) : null}

          {previewItems.length > 0 ? (
            <div className="space-y-2.5">
              {previewItems.map((item) => {
                const caption = item.title?.trim() || 'Draft post';
                const platform = item.platform?.trim() || 'twitter';
                const href = reviewHref
                  ? `${reviewHref}${reviewHref.includes('?') ? '&' : '?'}post=${encodeURIComponent(item.id)}`
                  : undefined;
                const previewProps = {
                  caption,
                  platform,
                  title: caption,
                };

                if (href) {
                  return (
                    <a
                      key={item.id}
                      href={href}
                      aria-label={`Open ${formatPlatformLabel(platform) ?? platform} draft in review`}
                      className="block rounded-xl transition-opacity hover:opacity-95"
                      data-testid="batch-generation-result-preview"
                    >
                      <PlatformPreview
                        className="max-h-[22rem] overflow-y-auto"
                        emptyMessage="No preview available for this draft."
                        target={previewProps}
                      />
                    </a>
                  );
                }

                return (
                  <div
                    key={item.id}
                    data-testid="batch-generation-result-preview"
                  >
                    <PlatformPreview
                      className="max-h-[22rem] overflow-y-auto"
                      emptyMessage="No preview available for this draft."
                      target={previewProps}
                    />
                  </div>
                );
              })}
              {remainingCount > 0 && reviewHref ? (
                <a
                  href={reviewHref}
                  className="inline-flex text-xs font-medium text-primary hover:underline"
                >
                  +{remainingCount} more post{remainingCount === 1 ? '' : 's'}{' '}
                  in review
                </a>
              ) : null}
            </div>
          ) : null}

          {action.ctas?.length ? (
            <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
              {action.ctas.map((cta, index) => renderCta(cta, index))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
