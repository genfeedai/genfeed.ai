'use client';

import { PostsLayoutContext } from '@contexts/posts/posts-layout-context';
import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingCampaignRoute,
  type PublishingCampaignSection,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type CampaignLifecycleResult,
  CampaignsService,
} from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Flag, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import {
  CAMPAIGN_STATUS_LABELS,
  summarizeCampaignLifecycleItems,
  visibleCampaignDeskActions,
} from '@/features/campaigns/campaigns-status';
import CampaignGenerateDialog from '@/features/campaigns/detail/CampaignGenerateDialog';
import CampaignUnavailableState from '@/features/campaigns/detail/CampaignUnavailableState';
import { useCampaign } from '@/features/campaigns/hooks/use-campaign';
import { usePostsLayoutSlots } from '@/features/posts/hooks/use-posts-layout-slots/use-posts-layout-slots';

export default function CampaignDetailShell({
  campaignId,
  children,
  section,
}: {
  campaignId: string;
  children?: ReactNode;
  section: PublishingCampaignSection;
}) {
  const translate = useTranslations('pages.publishing.campaigns');
  const { href } = useOrgUrl();
  const queryClient = useQueryClient();
  const { openConfirm } = useConfirmModal();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getService = useAuthedService((token: string) =>
    CampaignsService.getInstance(token),
  );
  const { campaign, isLoading, isUnavailable, refetch } =
    useCampaign(campaignId);
  const [isMutating, setIsMutating] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  // A section (the campaign calendar) mounts its controls in this shell's sub
  // bar, beside the campaign actions, never above its own content.
  const { contextValue: subbarContext, slots } = usePostsLayoutSlots();

  if (isUnavailable) {
    return <CampaignUnavailableState />;
  }

  if (isLoading || !campaign) {
    return (
      // The loaded shell below always uses `headerTabs` (section nav), so it
      // always renders as module-local chrome. Declare that explicitly here
      // too — otherwise, whenever no `right`/`tabs`/help happen to apply
      // during loading, Container would fall back to the classic layout and
      // the SectionTopbar would pop in once data resolves.
      <Container
        label={translate('title')}
        titleVisibility="sr-only"
        moduleChrome
      >
        <LoadingState isFullSize />
      </Container>
    );
  }

  const resolvedCampaign = campaign;
  const deskActions = visibleCampaignDeskActions(resolvedCampaign.status);
  const overviewHref = href(createPublishingCampaignRoute(resolvedCampaign.id));
  const contentHref = href(
    createPublishingCampaignRoute(resolvedCampaign.id, 'content'),
  );
  const calendarHref = href(
    createPublishingCampaignRoute(resolvedCampaign.id, 'calendar'),
  );
  const performanceHref = href(
    createPublishingCampaignRoute(campaign.id, 'performance'),
  );
  const adsHref = href(createPublishingCampaignRoute(campaign.id, 'ads'));

  async function invalidate(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['publish-campaigns'] });
    await queryClient.invalidateQueries({
      queryKey: ['publish-campaign', resolvedCampaign.id],
    });
    await refetch();
  }

  function notifyLifecycle(
    result: CampaignLifecycleResult,
    successKey: string,
  ): void {
    const summary = summarizeCampaignLifecycleItems(result.items);
    const message = translate(successKey, summary);
    if (summary.failed || summary.ineligible) {
      notificationsService.error(message);
    } else {
      notificationsService.success(message);
    }
  }

  function confirmLifecycle(
    titleKey: string,
    messageKey: string,
    confirmKey: string,
    successKey: string,
    failedKey: string,
    mutate: (service: CampaignsService) => Promise<CampaignLifecycleResult>,
    isError = false,
  ): void {
    openConfirm({
      cancelLabel: translate('cancel'),
      confirmLabel: translate(confirmKey),
      isError,
      label: translate(titleKey),
      message: translate(messageKey),
      onConfirm: async () => {
        setIsMutating(true);
        try {
          const service = await getService();
          const result = await mutate(service);
          notifyLifecycle(result, successKey);
          await invalidate();
        } catch (error) {
          logger.error(`Failed to ${confirmKey} campaign`, error);
          notificationsService.error(translate(failedKey));
        } finally {
          setIsMutating(false);
        }
      },
    });
  }

  function handleArchive(): void {
    openConfirm({
      cancelLabel: translate('cancel'),
      confirmLabel: translate('archive'),
      isError: true,
      label: translate('archiveTitle'),
      message: translate('archiveMessage'),
      onConfirm: async () => {
        setIsMutating(true);
        try {
          const service = await getService();
          await service.archive(resolvedCampaign.id);
          notificationsService.success(translate('archived'));
          await invalidate();
        } catch (error) {
          logger.error('Failed to archive campaign', error);
          notificationsService.error(translate('archiveFailed'));
        } finally {
          setIsMutating(false);
        }
      },
    });
  }

  async function handleRestore(): Promise<void> {
    setIsMutating(true);
    try {
      const service = await getService();
      await service.restore(resolvedCampaign.id);
      notificationsService.success(translate('restored'));
      await invalidate();
    } catch (error) {
      logger.error('Failed to restore campaign', error);
      notificationsService.error(translate('restoreFailed'));
    } finally {
      setIsMutating(false);
    }
  }

  function handleGenerate(): void {
    setIsGenerateOpen(true);
  }

  function handleStart(): void {
    confirmLifecycle(
      'startTitle',
      'startMessage',
      'start',
      'started',
      'startFailed',
      (service) => service.start(resolvedCampaign.id),
    );
  }

  function handlePause(): void {
    confirmLifecycle(
      'pauseTitle',
      'pauseMessage',
      'pause',
      'paused',
      'pauseFailed',
      (service) => service.pause(resolvedCampaign.id),
    );
  }

  function handleComplete(): void {
    confirmLifecycle(
      'completeTitle',
      'completeMessage',
      'complete',
      'completed',
      'completeFailed',
      (service) => service.complete(resolvedCampaign.id),
      true,
    );
  }

  return (
    <PostsLayoutContext.Provider value={subbarContext}>
      <Container
        headerTabs={{
          items: [
            {
              href: overviewHref,
              label: translate('tabs.overview'),
              matchMode: 'exact',
            },
            {
              href: contentHref,
              label: translate('tabs.content'),
              matchMode: 'exact',
            },
            {
              href: calendarHref,
              label: translate('tabs.calendar'),
              matchMode: 'exact',
            },
            {
              href: performanceHref,
              label: translate('tabs.performance'),
              matchMode: 'exact',
            },
            {
              href: adsHref,
              label: translate('tabs.ads'),
              matchMode: 'exact',
            },
          ],
        }}
        icon={Flag}
        label={resolvedCampaign.name}
        titleVisibility="visible"
        moduleChrome
        leading={slots.leadingNode}
        iconActions={slots.exportNode}
        right={
          <>
            <Badge status={resolvedCampaign.status}>
              {CAMPAIGN_STATUS_LABELS[resolvedCampaign.status] ??
                resolvedCampaign.status}
            </Badge>
            {slots.filtersNode}
            {slots.viewToggleNode}
            {slots.scheduleActionsNode}
            {deskActions.canStart ? (
              <Button
                isDisabled={isMutating}
                label={translate('start')}
                onClick={handleStart}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
            {deskActions.canPause ? (
              <Button
                isDisabled={isMutating}
                label={translate('pause')}
                onClick={handlePause}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
            {deskActions.canComplete ? (
              <Button
                isDisabled={isMutating}
                label={translate('complete')}
                onClick={handleComplete}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
            <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
              <Link href={href(APP_ROUTES.PUBLISHING.CAMPAIGNS)}>
                {translate('backToCampaigns')}
              </Link>
            </Button>
            {section === 'overview' ? (
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link
                  href={href(
                    createPublishingCampaignRoute(resolvedCampaign.id, 'edit'),
                  )}
                >
                  {translate('edit')}
                </Link>
              </Button>
            ) : null}
            {deskActions.canRestore ? (
              <Button
                isDisabled={isMutating}
                label={translate('restore')}
                onClick={() => {
                  void handleRestore();
                }}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              />
            ) : null}
            {deskActions.canArchive ? (
              <Button
                isDisabled={isMutating}
                label={translate('archive')}
                onClick={handleArchive}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
            {/* The primary action closes the bar. */}
            {deskActions.canGenerate ? (
              <Button
                isDisabled={isMutating}
                label={translate('generate')}
                icon={<Sparkles className="size-4" />}
                onClick={handleGenerate}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              />
            ) : null}
          </>
        }
      >
        {isGenerateOpen ? (
          <CampaignGenerateDialog
            campaign={resolvedCampaign}
            onClose={() => setIsGenerateOpen(false)}
          />
        ) : null}
        {children}
      </Container>
    </PostsLayoutContext.Provider>
  );
}
