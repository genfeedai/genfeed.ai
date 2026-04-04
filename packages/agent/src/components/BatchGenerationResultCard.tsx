import type {
  AgentUiAction,
  AgentUiActionCta,
} from '@cloud/agent/models/agent-chat.model';
import Badge from '@ui/display/badge/Badge';
import { type ReactElement } from 'react';
import {
  HiCalendarDays,
  HiCheckCircle,
  HiCurrencyDollar,
  HiRectangleStack,
  HiXCircle,
} from 'react-icons/hi2';

interface BatchGenerationResultCardProps {
  action: AgentUiAction;
}

function formatPlatformLabel(platform: string): string {
  const normalized = platform.trim().toLowerCase();

  if (normalized === 'twitter' || normalized === 'x') {
    return 'X';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function renderCta(cta: AgentUiActionCta, index: number): ReactElement | null {
  if (!cta.href) {
    return null;
  }

  const className =
    index === 0
      ? 'inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90'
      : 'inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';

  return (
    <a key={`${cta.label}-${index}`} href={cta.href} className={className}>
      {cta.label}
    </a>
  );
}

export function BatchGenerationResultCard({
  action,
}: BatchGenerationResultCardProps): ReactElement {
  const totalPosts = action.batchCount ?? 0;
  const creditsUsed = action.creditsUsed ?? 0;
  const completedCount = action.completedCount;
  const failedCount = action.failedCount;
  const hasCompletionMetrics =
    completedCount != null || (failedCount != null && failedCount > 0);
  const platformLabels = (action.platforms ?? []).map(formatPlatformLabel);

  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HiRectangleStack className="h-4.5 w-4.5 text-cyan-400" />
            <span>{action.title || 'Batch generation'}</span>
          </div>
          {action.description ? (
            <p className="text-sm leading-6 text-foreground/85">
              {action.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {action.status ? <Badge status={action.status} /> : null}
          {creditsUsed > 0 ? (
            <Badge variant="warning">
              <HiCurrencyDollar className="h-3 w-3" />
              {creditsUsed} credits
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Posts
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {totalPosts}
          </div>
        </div>

        {completedCount != null ? (
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <HiCheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              Ready
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {completedCount}
            </div>
          </div>
        ) : null}

        {failedCount != null && failedCount > 0 ? (
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <HiXCircle className="h-3.5 w-3.5 text-rose-400" />
              Failed
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {failedCount}
            </div>
          </div>
        ) : null}

        {!hasCompletionMetrics ? (
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <HiCalendarDays className="h-3.5 w-3.5 text-sky-400" />
              Queue
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              Review as drafts finish
            </div>
          </div>
        ) : null}
      </div>

      {platformLabels.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Platforms
          </div>
          <div className="flex flex-wrap gap-2">
            {platformLabels.map((platform) => (
              <Badge key={platform} variant="ghost">
                {platform}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {action.ctas?.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {action.ctas.map((cta, index) => renderCta(cta, index))}
        </div>
      ) : null}
    </div>
  );
}
