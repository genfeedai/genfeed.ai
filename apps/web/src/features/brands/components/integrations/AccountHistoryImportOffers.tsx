'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandDetailSocialMediaCardProps } from '@props/pages/brand-detail.props';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM } from '@/hooks/auth/use-platform-oauth-connect/oauth-connect-context';
import { ownAccountSourcesQueryKey } from './AccountHistoryImportPanel';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
  hasHistoryImport,
} from './account-connection-status.util';

type ImportOffersProps = Pick<
  BrandDetailSocialMediaCardProps,
  'brandId' | 'connections'
>;
type ImportOfferProps = Pick<ImportOffersProps, 'brandId'> & {
  connection: ImportOffersProps['connections'][number];
};

function AccountHistoryImportOffer({ brandId, connection }: ImportOfferProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const translateImport = useTranslations('pages.accountHistoryImport');
  const getSocialSourcesService = useAuthedService((token) =>
    SocialSourcesService.getInstance(token),
  );
  const queryClient = useQueryClient();
  const [isScheduling, setIsScheduling] = useState(false);
  const { credentialId } = connection;

  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete(
      HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM,
      credentialId,
    );
    window.history.replaceState(null, '', url);
  }

  async function importPosts() {
    setIsScheduling(true);
    const notifications = NotificationsService.getInstance();
    try {
      const service = await getSocialSourcesService();
      const result = await service.scheduleHistoryImport(credentialId, brandId);
      if (result.status === 'scheduled') {
        void queryClient.invalidateQueries({
          queryKey: ownAccountSourcesQueryKey(brandId),
        });
        dismiss();
        notifications.success(translateImport('queued'));
      } else {
        notifications.error(translateImport('error'));
      }
    } catch {
      notifications.error(translateImport('error'));
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <Alert size="sm">
      <AlertTitle>{translate('importOnConnectTitle')}</AlertTitle>
      <AlertDescription>
        {translate('importOnConnectDescription', {
          account: getConnectionLabel(connection),
        })}
      </AlertDescription>
      <AlertActions>
        <Button
          isDisabled={isScheduling}
          onClick={dismiss}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        >
          {translate('importOnConnectSkip')}
        </Button>
        <Button
          isLoading={isScheduling}
          onClick={importPosts}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        >
          {translate('importOnConnectConfirm')}
        </Button>
      </AlertActions>
    </Alert>
  );
}

export default function AccountHistoryImportOffers({
  brandId,
  connections,
}: ImportOffersProps) {
  const credentialIds = useSearchParams()?.getAll(
    HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM,
  );
  const accounts = connections.filter(
    (connection) =>
      credentialIds?.includes(connection.credentialId) &&
      hasHistoryImport(connection.platform) &&
      getAccountConnectionStatus(connection) === 'connected',
  );

  if (!accounts.length) return null;

  return (
    <div className="space-y-2">
      {accounts.map((connection) => (
        <AccountHistoryImportOffer
          brandId={brandId}
          connection={connection}
          key={connection.credentialId}
        />
      ))}
    </div>
  );
}
