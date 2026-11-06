'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { InstagramIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { CredentialInstagram } from '@genfeedai/models/auth/credential.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { InstagramAccountSelectorProps } from '@/features/auth/props/instagram-account-selector.props';

export type { InstagramAccountSelectorProps } from '@/features/auth/props/instagram-account-selector.props';

const EMPTY_ACCOUNTS: CredentialInstagram[] = [];

/**
 * Lets the operator resolve an ambiguous Instagram connection — several
 * eligible professional accounts and no automatic pick — by choosing one of
 * the candidates returned for this credential's own token. Reused by the
 * OAuth callback page.
 *
 * The pick is validated server-side: `handleConfirm` posts only the chosen
 * `externalId` to `POST /services/instagram/:credentialId/select-account`,
 * which re-derives handle/name/avatar from its own authorized-accounts list
 * and rejects an id that token does not actually grant.
 */
export default function InstagramAccountSelector({
  credentialId,
  onBack,
  onConnected,
  onError,
}: InstagramAccountSelectorProps) {
  const translate = useTranslations(
    'common.oauth.platformCallback.selectAccount',
  );
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('instagram', token),
  );

  const [pickedAccount, setPickedAccount] =
    useState<CredentialInstagram | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Cached per credential: going back and reopening the picker lists the
  // candidates at once while they refresh. The pick is still validated
  // server-side against this credential's token.
  const accountsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      const url = `GET /credentials/${credentialId}/instagram/pages`;
      try {
        const data = await service.findCredentialInstagramPages(
          credentialId,
          signal,
        );
        logger.info(`${url} success`, data);
        return data;
      } catch (fetchError) {
        if (!signal.aborted) {
          logger.error(`${url} failed`, fetchError);
        }
        throw fetchError;
      }
    },
    queryKey: ['instagram-credential-pages', credentialId],
    service: (token: string) => CredentialsService.getInstance(token),
  });
  const availableAccounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  // A refresh that no longer lists the pick clears it, so Confirm never sends
  // an account this credential stopped granting.
  const selectedAccount =
    pickedAccount &&
    availableAccounts.some((account) => account.id === pickedAccount.id)
      ? pickedAccount
      : null;
  const isLoading = accountsQuery.isLoading;
  // A failed background refresh keeps the cached candidates on screen.
  const hasLoadError = Boolean(accountsQuery.error) && !accountsQuery.data;
  const loadErrorMessage = translate('error');
  const error = confirmError ?? (hasLoadError ? loadErrorMessage : null);

  // `onError` churns identity on every render (callers rarely memoize an
  // inline handler), so it is read through a ref.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loadError = hasLoadError ? accountsQuery.error : null;

  useEffect(() => {
    if (loadError) {
      onErrorRef.current?.(loadErrorMessage);
    }
  }, [loadError, loadErrorMessage]);

  const retry = () => {
    setPickedAccount(null);
    setConfirmError(null);
    void accountsQuery.refetch();
  };

  const handleConfirm = async () => {
    if (!selectedAccount) {
      return;
    }

    setIsConnecting(true);
    setConfirmError(null);
    const url = `POST /services/instagram/${credentialId}/select-account`;

    try {
      const service = await getServicesService();
      await service.postSelectAccount(credentialId, selectedAccount.id);

      logger.info(`${url} success`);
      onConnected({
        avatarUrl: selectedAccount.image,
        name: selectedAccount.label || selectedAccount.username,
      });
    } catch (confirmError) {
      logger.error(`${url} failed`, confirmError);
      const message = translate('confirmError');
      setConfirmError(message);
      onError?.(message);
    } finally {
      setIsConnecting(false);
    }
  };

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

      {!isLoading && !error && availableAccounts.length === 0 && (
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

      {!isLoading && availableAccounts.length > 0 && (
        <OptionTileGroup
          ariaLabel={translate('title')}
          className="max-h-72 overflow-y-auto"
          columns={1}
          onValueChange={(accountId) => {
            const account = availableAccounts.find(
              (entry) => entry.id === accountId,
            );
            if (account) {
              setPickedAccount(account);
            }
          }}
          value={selectedAccount?.id}
        >
          {availableAccounts.map((account) => (
            <OptionTile
              icon={
                <Avatar
                  alt={account.label}
                  fallback={<InstagramIcon className="size-5" />}
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
                  @{account.username}
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
