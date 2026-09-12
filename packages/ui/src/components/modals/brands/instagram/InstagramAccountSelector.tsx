'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { InstagramIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { CredentialInstagram } from '@genfeedai/models/auth/credential.model';
import type { InstagramAccountSelectorProps } from '@genfeedai/props/auth/instagram-account-selector.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { Button } from '@ui/primitives/button';
import { CircleCheck } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export type { InstagramAccountSelectorProps } from '@genfeedai/props/auth/instagram-account-selector.props';

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
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('instagram', token),
  );

  const [availableAccounts, setAvailableAccounts] = useState<
    CredentialInstagram[]
  >([]);
  const [selectedAccount, setSelectedAccount] =
    useState<CredentialInstagram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // `translate` and `onError` churn identity every render (a fresh
  // `next-intl` translator, and callers rarely memoize an inline handler).
  // Reading them through a ref keeps the fetch effect keyed on the values
  // that actually identify "which credential's pages to load" instead of
  // re-running on every parent render.
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // getCredentialsService is intentionally left out of the deps below: the
  // real useAuthedService stabilizes it across renders (a volatile factory
  // is read through a ref), so it never meaningfully changes, and keying
  // this effect on it would let an unrelated re-render (selecting an
  // account, say) re-trigger the fetch and reset the loading state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryToken is a deliberate re-run trigger (not read inside the effect); getCredentialsService is deliberately omitted (see comment above).
  useEffect(() => {
    const controller = new AbortController();
    const url = `GET /credentials/${credentialId}/instagram/pages`;

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const service = await getCredentialsService();
        const data = await service.findCredentialInstagramPages(
          credentialId,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setAvailableAccounts(data);
        logger.info(`${url} success`, data);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(`${url} failed`, fetchError);
        const message = translateRef.current('error');
        setError(message);
        onErrorRef.current?.(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [credentialId, retryToken]);

  const retry = () => {
    setSelectedAccount(null);
    setRetryToken((token) => token + 1);
  };

  const handleConfirm = async () => {
    if (!selectedAccount) {
      return;
    }

    setIsConnecting(true);
    setError(null);
    const url = `POST /services/instagram/${credentialId}/select-account`;

    try {
      const service = await getServicesService();
      await service.postSelectAccount(credentialId, selectedAccount.id);

      logger.info(`${url} success`);
      onConnected();
    } catch (confirmError) {
      logger.error(`${url} failed`, confirmError);
      const message = translate('confirmError');
      setError(message);
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
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {availableAccounts.map((account) => (
            <Button
              key={account.id}
              className={`w-full p-3 transition-[box-shadow,background-color] ${
                selectedAccount?.id === account.id
                  ? 'shadow-border-strong bg-primary/10'
                  : 'hover:bg-hover'
              }`}
              onClick={() => setSelectedAccount(account)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <div className="flex items-center gap-2">
                {account.image ? (
                  <Image
                    src={account.image}
                    alt={account.label}
                    className="size-10 flex-shrink-0 rounded-full object-cover outline-media"
                    width={40}
                    height={40}
                    sizes="40px"
                  />
                ) : (
                  <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-platform-instagram">
                    <InstagramIcon
                      className={
                        'text-lg text-white' /* design-system-allow-content-color -- platform mark */
                      }
                    />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="font-medium">{account.label}</p>
                  <p className="text-sm text-muted-foreground">
                    @{account.username}
                  </p>
                </div>
                {selectedAccount?.id === account.id && (
                  <CircleCheck className="text-primary text-xl" />
                )}
              </div>
            </Button>
          ))}
        </div>
      )}

      {!isLoading && availableAccounts.length > 0 && (
        <Button
          label={isConnecting ? translate('confirming') : translate('confirm')}
          onClick={handleConfirm}
          isLoading={isConnecting}
          isDisabled={isConnecting || !selectedAccount}
        />
      )}
    </div>
  );
}
