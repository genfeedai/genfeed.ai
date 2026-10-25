'use client';

import { useAgentApiService } from '@genfeedai/agent/components/AgentApiServiceContext';
import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import { AGENT_CONVERSATION_SURFACE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import { useTurboRunProgress } from '@genfeedai/agent/hooks/use-turbo-run-progress';
import type {
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { normalizeAgentAppHref } from '@genfeedai/agent/utils/normalize-agent-app-href';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
import {
  createPublishingApprovalsRoute,
  formatCreditCost,
} from '@genfeedai/contracts/constants';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { resolvePreviewAuthor } from '@ui/posts/platform-preview/preview-author';
import { Button } from '@ui/primitives/button';
import { CircleCheck, CircleX, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

interface TurboRunResultCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

type TurboRunPreviewItem = NonNullable<AgentUiAction['items']>[number];

/** Drafts shown in the thread; the rest are one click away in the approval queue. */
const MAX_LIVE_PREVIEWS = 10;
const MAX_REWORK_CAPTION_LENGTH = 500;

interface TurboRunResultView {
  completedCount?: number;
  failedCount?: number;
  items: TurboRunPreviewItem[];
  platforms: string[];
  remainingCount?: number;
  status?: string;
  totalPosts: number;
}

/**
 * The live run when it has been fetched, else the snapshot the reply carried.
 * Only completed drafts with text are shown, so a half-written post never
 * appears in the thread.
 */
function resolveRunView(
  action: AgentUiAction,
  run: ITurboRunSummary | null,
): TurboRunResultView {
  if (!run) {
    return {
      completedCount: action.completedCount,
      failedCount: action.failedCount,
      items: action.items ?? [],
      platforms: action.platforms ?? [],
      remainingCount: action.remainingCount,
      status: action.status,
      totalPosts: action.turboRunCount ?? 0,
    };
  }
  const drafts = (run.items ?? []).filter(
    (item) =>
      item.status === TurboRunItemStatus.COMPLETED && item.caption?.trim(),
  );
  return {
    completedCount: run.completedCount,
    failedCount: run.failedCount,
    items: drafts.slice(0, MAX_LIVE_PREVIEWS).map((item) => ({
      brandId: run.brandId,
      id: item.id,
      platform: item.platform,
      title: item.caption?.trim() ?? '',
      type: 'post',
    })),
    platforms: run.platforms?.length ? run.platforms : (action.platforms ?? []),
    remainingCount: Math.max(drafts.length - MAX_LIVE_PREVIEWS, 0),
    status: run.status.toLowerCase(),
    totalPosts: run.totalCount ?? run.totalItems ?? action.turboRunCount ?? 0,
  };
}

function buildReworkPrompt(
  caption: string,
  platform: string,
  turboRunId: string,
  itemId: string,
): string {
  const text =
    caption.length > MAX_REWORK_CAPTION_LENGTH
      ? `${caption.slice(0, MAX_REWORK_CAPTION_LENGTH)}…`
      : caption;
  return `Rework this ${formatPlatformLabel(platform) ?? platform} post (run ${turboRunId}, item ${itemId}). Keep the topic and the brand voice, but give it a stronger hook and a fresh angle.\n\nCurrent draft:\n${text}`;
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

interface TurboRunDraftPreviewProps {
  action: AgentUiAction;
  item: TurboRunPreviewItem;
  onUiAction?: AgentUiActionHandler;
  reviewHref?: string;
  turboRunId?: string;
}

/** One generated post: its platform preview with review and rework in one click. */
function TurboRunDraftPreview({
  action,
  item,
  onUiAction,
  reviewHref,
  turboRunId,
}: TurboRunDraftPreviewProps): ReactElement {
  const translate = useTranslations('agent.turboRunResultCard');
  const brandScope = useBrand();
  const request = useAgentUiActionRequest(onUiAction);
  const caption = item.title?.trim() || 'Draft post';
  const platform = item.platform?.trim() || action.platform?.trim() || 'post';
  const platformLabel = formatPlatformLabel(platform) ?? platform;
  const reworkPayload = turboRunId
    ? {
        prompt: buildReworkPrompt(caption, platform, turboRunId, item.id),
        sourceActionId: `${action.id}:rework:${item.id}`,
      }
    : undefined;
  const reworkPhase = request.getPhase('send_prompt', reworkPayload);
  const isReworkBusy = reworkPhase === 'running' || reworkPhase === 'awaiting';
  const previewProps = {
    author: resolvePreviewAuthor(brandScope, {
      platform,
      brandId: item.brandId ?? action.brandId,
      credentialId: item.credentialId ?? action.credentialId,
    }),
    caption,
    platform,
    title: caption,
  };

  return (
    <div className="space-y-2" data-testid="turbo-run-result-preview">
      <PlatformPreview
        className="max-h-[22rem] overflow-y-auto"
        emptyMessage={translate('noDraftPreview')}
        target={previewProps}
      />
      {reviewHref || (onUiAction && reworkPayload) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {reviewHref ? (
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <a
                href={reviewHref}
                aria-label={translate('reviewAria', {
                  platform: platformLabel,
                })}
              >
                {translate('review')}
              </a>
            </Button>
          ) : null}
          {onUiAction && reworkPayload ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              aria-label={translate('reworkAria', { platform: platformLabel })}
              isDisabled={isReworkBusy || reworkPhase === 'completed'}
              isLoading={isReworkBusy}
              onClick={() => void request.submit('send_prompt', reworkPayload)}
            >
              {translate(
                reworkPhase === 'completed' ? 'reworkRequested' : 'rework',
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
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
 * Dense run outcome surface — header metrics + Publish-style platform
 * previews for the generated drafts (same PlatformPreview as review queue).
 * For a run the card follows it live: queued, generating, then each draft with
 * a one-click review and rework, ending with a link to the approval queue.
 * Collapsible body matches completion-summary density.
 */
export function TurboRunResultCard({
  action,
  onUiAction,
}: TurboRunResultCardProps): ReactElement {
  const translate = useTranslations('agent.turboRunResultCard');
  const turboRunId =
    typeof action.data?.turboRunId === 'string'
      ? action.data.turboRunId
      : undefined;
  const run = useTurboRunProgress(useAgentApiService(), turboRunId);
  const view = resolveRunView(action, run);
  const activeStatuses = {
    pending: 'queued',
    queued: 'queued',
    processing: 'generating',
    running: 'generating',
    generating: 'generating',
    saving: 'saving',
  } as const;
  const statusKey = view.status?.toLowerCase();
  const activeStatus =
    statusKey && Object.hasOwn(activeStatuses, statusKey)
      ? activeStatuses[statusKey as keyof typeof activeStatuses]
      : undefined;
  const totalPosts = view.totalPosts;
  const creditsUsed = action.creditsUsed ?? 0;
  const { completedCount, failedCount } = view;
  const platformLabels = view.platforms.map(
    (platform) => formatPlatformLabel(platform) ?? platform,
  );
  const previewItems = view.items;
  const remainingCount =
    view.remainingCount ??
    Math.max((completedCount ?? 0) - previewItems.length, 0);
  const reviewHref = turboRunId
    ? createPublishingApprovalsRoute({ run: turboRunId })
    : resolveReviewHref(action);
  const isCancelled = statusKey === 'cancelled';
  const isAllFailed =
    isCancelled || ((completedCount ?? 0) === 0 && (failedCount ?? 0) > 0);
  const isPartialFail = (completedCount ?? 0) > 0 && (failedCount ?? 0) > 0;
  const title = run
    ? activeStatus
      ? translate('titleGenerating')
      : isCancelled
        ? translate('titleCancelled')
        : isAllFailed
          ? translate('titleFailed')
          : translate('titleReady', { count: completedCount ?? 0 })
    : action.title ||
      (activeStatus
        ? 'Turbo run in progress'
        : isAllFailed
          ? 'Turbo run failed'
          : 'Turbo run complete');
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
    creditsUsed > 0 ? formatCreditCost(creditsUsed, { unit: 'credits' }) : null,
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
      data-testid="turbo-run-result"
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        {activeStatus ? null : isAllFailed ? (
          <CircleX className="size-4 shrink-0 text-rose-400" />
        ) : isPartialFail ? (
          <Layers className="size-4 shrink-0 text-warning" />
        ) : (
          <CircleCheck className="size-4 shrink-0 text-success" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {title}
            </span>
            {view.status ? (
              <Badge status={view.status} className="h-5 text-2xs" />
            ) : null}
          </div>
          {activeStatus ? (
            <GenerationStatus
              status={activeStatus}
              assetLabel="posts"
              completedCount={completedCount ?? 0}
              totalCount={totalPosts}
              compact
            />
          ) : null}
          {isCollapsed && (action.description || metricsLine) ? (
            <p className="truncate text-xs leading-5 text-foreground/70">
              {action.description?.trim() || metricsLine}
            </p>
          ) : null}
        </div>
        {hasCollapsibleBody ? (
          <AgentCardCollapseToggle
            isCollapsed={isCollapsed}
            labelCollapse="Collapse run result"
            labelExpand="Expand run result"
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
              {previewItems.map((item) => (
                <TurboRunDraftPreview
                  key={item.id}
                  action={action}
                  item={item}
                  onUiAction={onUiAction}
                  reviewHref={
                    turboRunId
                      ? createPublishingApprovalsRoute({
                          item: item.id,
                          run: turboRunId,
                        })
                      : reviewHref
                        ? `${reviewHref}${reviewHref.includes('?') ? '&' : '?'}post=${encodeURIComponent(item.id)}`
                        : undefined
                  }
                  turboRunId={turboRunId}
                />
              ))}
              {remainingCount > 0 && reviewHref ? (
                <a
                  href={reviewHref}
                  className="inline-flex text-xs font-medium text-primary hover:underline"
                >
                  {translate('remainingInReview', { count: remainingCount })}
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
