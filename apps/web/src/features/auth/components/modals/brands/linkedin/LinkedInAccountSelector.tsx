'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ICredentialLinkedInAccount } from '@genfeedai/contracts/interfaces';
import { LinkedinIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
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
import type { LinkedInAccountSelectorProps } from '@/features/auth/props/linkedin-account-selector.props';

export type { LinkedInAccountSelectorProps } from '@/features/auth/props/linkedin-account-selector.props';

const EMPTY_ACCOUNTS: ICredentialLinkedInAccount[] = [];

/**
 * After LinkedIn authorizes, the member chooses what this connection posts as:
 * a company page they run, or their own profile. Nothing is connected until
 * they choose, so a brand never ends up posting from a personal profile by
 * default.
 *
 * Only the chosen `id` is sent to `POST /services/linkedin/:credentialId/
 * select-account`; the server re-reads the account list with this credential's
 * own token and rejects an id the token does not reach.
 */
export default function LinkedInAccountSelector({
  credentialId,
  onBack,
  onConnected,
  onError,
}: LinkedInAccountSelectorProps) {
  const translate = useTranslations(
    'common.oauth.platformCallback.selectLinkedInAccount',
  );
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('linkedin', token),
  );

  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const accountsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      const url = `GET /services/linkedin/${credentialId}/accounts`;
      try {
        const data = await service.findLinkedInAccounts(credentialId, signal);
        logger.info(`${url} success`, data);
        return data;
      } catch (fetchError) {
        if (!signal.aborted) {
          logger.error(`${url} failed`, fetchError);
        }
        throw fetchError;
      }
    },
    queryKey: ['linkedin-credential-accounts', credentialId],
    service: (token: string) => new ServicesService('linkedin', token),
  });
  const availableAccounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  // A refresh that no longer lists the pick clears it, so Confirm never sends
  // an account this credential stopped reaching.
  const selectedAccount =
    availableAccounts.find((account) => account.id === pickedAccountId) ?? null;
  const isLoading = accountsQuery.isLoading;
  const hasLoadError = Boolean(accountsQuery.error) && !accountsQuery.data;
  const loadErrorMessage = translate('error');
  const error = confirmError ?? (hasLoadError ? loadErrorMessage : null);

  // `onError` churns identity on every render, so it is read through a ref.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loadError = hasLoadError ? accountsQuery.error : null;

  useEffect(() => {
    if (loadError) {
      onErrorRef.current?.(loadErrorMessage);
    }
  }, [loadError, loadErrorMessage]);

  const retry = () => {
    setPickedAccountId(null);
    setConfirmError(null);
    void accountsQuery.refetch();
  };

  const handleConfirm = async () => {
    if (!selectedAccount) {
      return;
    }

    setIsConnecting(true);
    setConfirmError(null);
    const url = `POST /services/linkedin/${credentialId}/select-account`;

    try {
      const service = await getServicesService();
      await service.postSelectAccount(credentialId, selectedAccount.id);

      logger.info(`${url} success`);
      onConnected({
        avatarUrl: selectedAccount.image,
        name: selectedAccount.label,
      });
    } catch (selectError) {
      logger.error(`${url} failed`, selectError);
      const message = translate('confirmError');
      setConfirmError(message);
      onError?.(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const backButton = onBack ? (
    <Button
      label={translate('back')}
      onClick={onBack}
      variant={ButtonVariant.LINK}
      withWrapper={false}
    />
  ) : null;

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
            {backButton}
          </div>
        </div>
      )}

      {!isLoading && !error && availableAccounts.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{translate('empty')}</p>
          <div className="flex gap-2">
            <Button
              label={translate('retry')}
              onClick={retry}
              variant={ButtonVariant.SECONDARY}
            />
            {backButton}
          </div>
        </div>
      )}

      {!isLoading && availableAccounts.length > 0 && (
        <OptionTileGroup
          ariaLabel={translate('title')}
          className="max-h-72 overflow-y-auto"
          columns={1}
          onValueChange={setPickedAccountId}
          value={selectedAccount?.id}
        >
          {availableAccounts.map((account) => (
            <OptionTile
              icon={
                <Avatar
                  alt={account.label}
                  fallback={<LinkedinIcon className="size-5" />}
                  name={account.label}
                  size="lg"
                  src={account.image}
                />
              }
              key={account.id}
              value={account.id}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{account.label}</span>
                  {account.isAlreadyConnected && (
                    <Badge variant="info">
                      {translate('alreadyConnected')}
                    </Badge>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {account.kind === 'organization'
                    ? translate('kind.organization')
                    : translate('kind.member')}
                </span>
              </span>
              {selectedAccount?.id === account.id && (
                <CircleCheck className="text-primary text-xl" />
              )}
            </OptionTile>
          ))}
        </OptionTileGroup>
      )}

      {!isLoading && availableAccounts.length > 0 && (
        <div className="flex gap-2">
          <Button
            label={
              isConnecting ? translate('confirming') : translate('confirm')
            }
            onClick={handleConfirm}
            isLoading={isConnecting}
            isDisabled={isConnecting || !selectedAccount}
          />
          {onBack && (
            <Button
              label={translate('cancel')}
              onClick={onBack}
              isDisabled={isConnecting}
              variant={ButtonVariant.SECONDARY}
            />
          )}
        </div>
      )}
    </div>
  );
}
