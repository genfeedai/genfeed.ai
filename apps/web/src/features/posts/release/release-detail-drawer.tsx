'use client';

import {
  ContextSidebarHeaderSlot,
  ContextSidebarPanel,
} from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ReleaseStatus } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useResetOnChange } from '@hooks/utils/use-reset-on-change/use-reset-on-change';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { Alert, AlertActions, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReleaseDrawerView } from '@/features/posts/props/release-drawer.props';
import { RELEASE_RESUME_ACTION } from '@/features/posts/release/release-actions';
import ReleaseAnalyticsTable from '@/features/posts/release/release-analytics-table';
import ReleaseDetailsView from '@/features/posts/release/release-details-view';
import ReleaseHistoryView from '@/features/posts/release/release-history-view';
import ReleasePreviewPanel from '@/features/posts/release/release-preview-panel';
import ReleaseViewSwitcher from '@/features/posts/release/release-view-switcher';
import {
  badgeVariantForTone,
  releaseStatusBadge,
  releaseTargets,
  releaseTimeline,
} from '@/features/posts/shared/release-status.helpers';
import type { ReleaseDetailDrawerProps } from '@/props/publisher/release-calendar.props';
import { formatInstant } from './format-instant';

export default function ReleaseDetailDrawer({
  brandId,
  error,
  onAddChannel,
  onChangeCampaign,
  onClose,
  onCompleteManualPost,
  onRescheduleRelease,
  onRescheduleTarget,
  onResumeRelease,
  onRetryTarget,
  onSkipManualPost,
  pendingAction,
  reconnectHref,
  release,
  seriesControls,
}: ReleaseDetailDrawerProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const { href } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const [accountHealth, setAccountHealth] = useState<AccountHealthSummary[]>(
    [],
  );
  const [activeView, setActiveView] = useState<ReleaseDrawerView>('preview');

  // Only reset the open view when the drawer points at a *different* release;
  // a mutation-triggered refetch of the same release should not yank the
  // reader off Details or Analytics back to the preview.
  useResetOnChange([release?.id], () => {
    setActiveView('preview');
  });

  // The drawer owns its own account-health lookup so every caller (calendar,
  // rail) can hand it a brandId without also wiring a credentials fetch.
  // use-effect-audit: ignore abortable request
  useEffect(() => {
    const controller = new AbortController();

    async function loadAccountHealth() {
      if (!brandId) {
        setAccountHealth([]);
        return;
      }
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!controller.signal.aborted) {
          setAccountHealth(summaries);
        }
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          logger.error(
            'Failed to load release drawer account health',
            fetchError,
          );
        }
      }
    }

    void loadAccountHealth();

    return () => controller.abort();
  }, [brandId, getToken]);

  const isPending = pendingAction !== null;
  const targets = releaseTargets(release);
  const statusBadge = release ? releaseStatusBadge(release) : null;
  const timeline = release ? releaseTimeline(release) : null;
  const isPaused = release?.status === ReleaseStatus.PAUSED;
  const previewTitle =
    stripHtmlToPlainText(release?.title) || translate('untitledPost');
  const editorHref = release
    ? href(getPublishingPostHref(targets[0]?.id ?? release.id))
    : null;

  if (!release) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  const channelCount = translate('channelCount', { count: targets.length });

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id: release.id,
        kind: 'post',
        origin: 'user',
        title: previewTitle,
      }}
    >
      <ContextSidebarHeaderSlot>
        <ReleaseViewSwitcher
          activeView={activeView}
          editorHref={editorHref}
          onViewChange={setActiveView}
        />
      </ContextSidebarHeaderSlot>

      <div className="flex flex-col" data-testid="release-detail-panel">
        <div className="flex items-center gap-2 border-b border-border px-4 pb-3">
          {statusBadge ? (
            <Badge variant={badgeVariantForTone(statusBadge.tone)}>
              {statusBadge.label}
            </Badge>
          ) : null}
          <span
            className="truncate text-xs text-muted-foreground"
            data-testid="release-summary"
          >
            {timeline ? (
              <>
                {channelCount} · {translate(`summary.${timeline.kind}`)}{' '}
                <time dateTime={timeline.at}>{formatInstant(timeline.at)}</time>
              </>
            ) : (
              channelCount
            )}
          </span>
        </div>

        {error || isPaused ? (
          <div className="space-y-3 px-4 pt-4">
            {error ? <Alert variant="destructive">{error}</Alert> : null}

            {isPaused ? (
              <Alert role="status" variant="warning">
                <AlertTitle>{translate('pausedHold')}</AlertTitle>
                {onResumeRelease ? (
                  <AlertActions>
                    <Button
                      isDisabled={isPending}
                      isLoading={pendingAction === RELEASE_RESUME_ACTION}
                      label={translate('resume')}
                      onClick={onResumeRelease}
                      size={ButtonSize.SM}
                    />
                  </AlertActions>
                ) : null}
              </Alert>
            ) : null}
          </div>
        ) : null}

        {activeView === 'preview' ? (
          <ReleasePreviewPanel key={release.id} release={release} />
        ) : null}
        {activeView === 'details' ? (
          <ReleaseDetailsView
            accountHealth={accountHealth}
            editorHref={editorHref}
            onAddChannel={onAddChannel}
            onChangeCampaign={onChangeCampaign}
            onCompleteManualPost={onCompleteManualPost}
            onRescheduleRelease={onRescheduleRelease}
            onRescheduleTarget={onRescheduleTarget}
            onRetryTarget={onRetryTarget}
            onSkipManualPost={onSkipManualPost}
            pendingAction={pendingAction}
            reconnectHref={reconnectHref}
            release={release}
            seriesControls={seriesControls}
          />
        ) : null}
        {activeView === 'history' ? (
          <ReleaseHistoryView release={release} />
        ) : null}
        {activeView === 'analytics' ? (
          <div className="p-4">
            <section className="space-y-3">
              <h3 className="font-medium text-foreground">
                {translate('analytics.title')}
              </h3>
              <ReleaseAnalyticsTable comparison={release.analyticsComparison} />
            </section>
          </div>
        ) : null}
      </div>
    </ContextSidebarPanel>
  );
}
