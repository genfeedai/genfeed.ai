'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IGoogleAdsAccount } from '@genfeedai/contracts/interfaces';
import { GoogleColorIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { GoogleAdsAccountSelectorProps } from '@/features/auth/props/google-ads-account-selector.props';

export type { GoogleAdsAccountSelectorProps } from '@/features/auth/props/google-ads-account-selector.props';

const EMPTY_ACCOUNTS: IGoogleAdsAccount[] = [];

interface AccountGroup {
  accounts: IGoogleAdsAccount[];
  key: string;
  managerName?: string;
}

/**
 * Accounts reached through one manager sit under that manager's name; the
 * rest are the login's own. Group order follows the first account of each.
 */
function groupAccounts(accounts: IGoogleAdsAccount[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const account of accounts) {
    const key = account.managerId ?? '';
    const group = groups.get(key) ?? {
      accounts: [],
      key,
      managerName: account.managerName,
    };
    group.accounts.push(account);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Lets the operator choose which Google Ads account a brand reads campaigns
 * from when the Google login reaches more than one. Reused by the OAuth
 * callback page.
 *
 * The pick is validated server-side: `handleConfirm` posts only the chosen
 * id to `POST /services/google-ads/:credentialId/select-account`, which reads
 * the accounts again from Google and rejects an id this token does not reach.
 */
export default function GoogleAdsAccountSelector({
  credentialId,
  onBack,
  onConnected,
  onError,
}: GoogleAdsAccountSelectorProps) {
  const translate = useTranslations(
    'common.oauth.platformCallback.selectAdsAccount',
  );
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('google-ads', token),
  );

  const [pickedId, setPickedId] = useState<string | undefined>(undefined);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const accountsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      const url = `GET /services/google-ads/${credentialId}/accounts`;
      try {
        const data = await service.getGoogleAdsAccounts(credentialId, signal);
        logger.info(`${url} success`, { count: data.length });
        return data;
      } catch (fetchError) {
        if (!signal.aborted) {
          logger.error(`${url} failed`, fetchError);
        }
        throw fetchError;
      }
    },
    queryKey: ['google-ads-accounts', credentialId],
    service: (token: string) => new ServicesService('google-ads', token),
  });
  const accounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  // A refresh that no longer lists the pick drops it, so Confirm never sends
  // an account this credential stopped reaching.
  const selectedId = accounts.some((account) => account.id === pickedId)
    ? pickedId
    : undefined;
  const isLoading = accountsQuery.isLoading;
  const hasLoadError = Boolean(accountsQuery.error) && !accountsQuery.data;
  const loadErrorMessage = translate('error');
  const error = confirmError ?? (hasLoadError ? loadErrorMessage : null);

  // `onError` churns identity on every render, so it is read through a ref.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loadError = hasLoadError ? accountsQuery.error : null;

  // use-effect-audit: ignore reports a failed load to the logger or a notification
  useEffect(() => {
    if (loadError) {
      onErrorRef.current?.(loadErrorMessage);
    }
  }, [loadError, loadErrorMessage]);

  const retry = () => {
    setPickedId(undefined);
    setConfirmError(null);
    void accountsQuery.refetch();
  };

  const handleConfirm = async () => {
    const chosen = accounts.find((account) => account.id === selectedId);
    if (!chosen) {
      return;
    }

    setIsConnecting(true);
    setConfirmError(null);
    const url = `POST /services/google-ads/${credentialId}/select-account`;

    try {
      const service = await getServicesService();
      const connected = await service.postSelectGoogleAdsAccount(
        credentialId,
        chosen.id,
      );
      logger.info(`${url} success`);
      const account: ConnectionAccount = {
        avatarUrl: connected.externalAvatar,
        name: connected.externalName || connected.externalHandle || chosen.name,
      };
      onConnected(account);
    } catch (confirmFailure) {
      logger.error(`${url} failed`, confirmFailure);
      const message = translate('confirmError');
      setConfirmError(message);
      onError?.(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const groups = groupAccounts(accounts);

  return (
    <div className="w-full max-w-md space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold">{translate('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{translate('loading')}</p>
      )}

      {!isLoading && error && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <div className="flex gap-2">
            <Button
              label={translate('retry')}
              onClick={retry}
              variant={ButtonVariant.SECONDARY}
            />
            {onBack && (
              <Button
                label={translate('back')}
                onClick={onBack}
                variant={ButtonVariant.LINK}
                withWrapper={false}
              />
            )}
          </div>
        </div>
      )}

      {!isLoading && !error && accounts.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{translate('empty')}</p>
          <div className="flex gap-2">
            <Button
              label={translate('retry')}
              onClick={retry}
              variant={ButtonVariant.SECONDARY}
            />
            {onBack && (
              <Button
                label={translate('back')}
                onClick={onBack}
                variant={ButtonVariant.LINK}
                withWrapper={false}
              />
            )}
          </div>
        </div>
      )}

      {!isLoading && accounts.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <div className="space-y-2" key={group.key}>
              {group.key ? (
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {group.managerName ?? group.key}
                  <Badge variant="info">{translate('managerBadge')}</Badge>
                </p>
              ) : groups.length > 1 ? (
                <p className="text-xs font-medium text-muted-foreground">
                  {translate('ownAccounts')}
                </p>
              ) : null}
              <OptionTileGroup
                ariaLabel={group.managerName ?? translate('ownAccounts')}
                columns={1}
                onValueChange={setPickedId}
                value={selectedId}
              >
                {group.accounts.map((account) => (
                  <OptionTile
                    description={account.id}
                    icon={
                      <Avatar
                        alt={account.name}
                        fallback={<GoogleColorIcon className="size-5" />}
                        name={account.name}
                        size="lg"
                      />
                    }
                    key={account.id}
                    title={
                      <span className="flex items-center gap-2">
                        {account.name}
                        {account.isAlreadyConnected && (
                          <Badge variant="info">
                            {translate('alreadyConnected')}
                          </Badge>
                        )}
                      </span>
                    }
                    trailing={
                      selectedId === account.id ? (
                        <CircleCheck className="text-primary text-xl" />
                      ) : undefined
                    }
                    value={account.id}
                  />
                ))}
              </OptionTileGroup>
            </div>
          ))}
        </div>
      )}

      {!isLoading && accounts.length > 0 && (
        <div className="flex gap-2">
          <Button
            isDisabled={isConnecting || !selectedId}
            isLoading={isConnecting}
            label={
              isConnecting ? translate('confirming') : translate('confirm')
            }
            onClick={handleConfirm}
          />
          {onBack && (
            <Button
              isDisabled={isConnecting}
              label={translate('cancel')}
              onClick={onBack}
              variant={ButtonVariant.SECONDARY}
            />
          )}
        </div>
      )}
    </div>
  );
}
