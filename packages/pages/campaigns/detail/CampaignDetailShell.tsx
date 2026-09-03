'use client';

import {
  ButtonSize,
  ButtonVariant,
  ContentCampaignStatus,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingCampaignRoute,
  type PublishingCampaignSection,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCampaign } from '@hooks/data/campaigns/use-campaign';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { CAMPAIGN_STATUS_LABELS } from '@pages/campaigns/campaigns-status';
import CampaignUnavailableState from '@pages/campaigns/detail/CampaignUnavailableState';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { CampaignsService } from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

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

  if (isUnavailable) {
    return <CampaignUnavailableState />;
  }

  if (isLoading || !campaign) {
    return (
      <Container label={translate('title')} titleVisibility="sr-only">
        <LoadingState isFullSize />
      </Container>
    );
  }

  const resolvedCampaign = campaign;
  const isArchived = resolvedCampaign.status === ContentCampaignStatus.ARCHIVED;
  const overviewHref = href(createPublishingCampaignRoute(resolvedCampaign.id));
  const contentHref = href(
    createPublishingCampaignRoute(resolvedCampaign.id, 'content'),
  );
  const calendarHref = href(
    createPublishingCampaignRoute(resolvedCampaign.id, 'calendar'),
  );

  async function invalidate(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['publish-campaigns'] });
    await queryClient.invalidateQueries({
      queryKey: ['publish-campaign', resolvedCampaign.id],
    });
    await refetch();
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

  return (
    <Container
      description={resolvedCampaign.objective || translate('listDescription')}
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
        ],
        size: 'sm',
        variant: 'underline',
      }}
      icon={Flag}
      label={resolvedCampaign.name}
      right={
        <div className="flex items-center gap-2">
          <Badge status={resolvedCampaign.status}>
            {CAMPAIGN_STATUS_LABELS[resolvedCampaign.status] ??
              resolvedCampaign.status}
          </Badge>
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
          {isArchived ? (
            <Button
              isDisabled={isMutating}
              label={translate('restore')}
              onClick={() => {
                void handleRestore();
              }}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          ) : (
            <Button
              isDisabled={isMutating}
              label={translate('archive')}
              onClick={handleArchive}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            />
          )}
        </div>
      }
      titleVisibility="visible"
    >
      {children}
    </Container>
  );
}
