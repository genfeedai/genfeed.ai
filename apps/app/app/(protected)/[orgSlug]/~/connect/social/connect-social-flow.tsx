'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import Card from '@ui/card/Card';
import { resolveOAuthServicePath } from '@ui/constants/oauth-connect-platforms';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

export default function ConnectSocialFlow() {
  const translate = useTranslations('pages.connectSocial');
  const searchParams = useSearchParams();
  const { getToken } = useAuthIdentity();
  const { orgHref } = useOrgUrl();
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const platform = searchParams.get('platform')?.trim() ?? '';
  const brandId = searchParams.get('brandId')?.trim() ?? '';
  const connectionId = searchParams.get('connectionId')?.trim() ?? '';

  const handleConnect = useCallback(async () => {
    setErrorMessage(null);
    if (!platform || !brandId) {
      setErrorMessage(translate('missingScope'));
      return;
    }

    setIsConnecting(true);
    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error(translate('missingAuth'));
      }
      const service = new ServicesService(
        resolveOAuthServicePath(platform),
        token,
      );
      const credential = await service.postConnect({
        brandId,
        ...(connectionId ? { credentialId: connectionId } : {}),
      });
      const returnTo = orgHref(`${APP_ROUTES.CONNECT}/social`);
      const separator = credential.url.includes('?') ? '&' : '?';
      window.open(
        `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
        '_self',
      );
    } catch (error) {
      logger.error('Social connection failed', error);
      NotificationsService.getInstance().error(translate('failed'));
      setErrorMessage(translate('failed'));
      setIsConnecting(false);
    }
  }, [brandId, connectionId, getToken, orgHref, platform, translate]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-10">
      <Card>
        <div className="flex flex-col gap-4 p-6">
          <h1 className="text-xl font-semibold">{translate('title')}</h1>
          <p className="text-muted-foreground">{translate('description')}</p>
          {platform ? (
            <p>
              {translate('platformLabel')}: <strong>{platform}</strong>
            </p>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>{translate('failedTitle')}</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            disabled={isConnecting || !platform || !brandId}
            onClick={() => {
              void handleConnect();
            }}
          >
            {isConnecting ? translate('connecting') : translate('authorize')}
          </Button>
          <p className="text-muted-foreground text-sm">
            {translate('returnHint')}
          </p>
        </div>
      </Card>
    </div>
  );
}
