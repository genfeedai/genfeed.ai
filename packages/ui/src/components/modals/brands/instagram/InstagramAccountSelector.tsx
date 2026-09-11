'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { CredentialInstagram } from '@genfeedai/models/auth/credential.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { Button } from '@ui/primitives/button';
import { CircleCheck } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export interface InstagramAccountSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called once the chosen account has been persisted. */
  onConnected: () => void;
  onError?: (message: string) => void;
}

/**
 * Lets the operator resolve an ambiguous Instagram connection — several
 * eligible professional accounts and no automatic pick — by choosing one of
 * the candidates returned for this credential's own token. Reused by the
 * OAuth callback page; `ModalBrandInstagram` covers the equivalent settings
 * surface with its own list rendering.
 */
export default function InstagramAccountSelector({
  credentialId,
  onConnected,
  onError,
}: InstagramAccountSelectorProps) {
  const translate = useTranslations(
    'common.oauth.platformCallback.selectAccount',
  );
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );

  const [availableAccounts, setAvailableAccounts] = useState<
    CredentialInstagram[]
  >([]);
  const [selectedAccount, setSelectedAccount] =
    useState<CredentialInstagram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `translate` and `onError` churn identity every render (a fresh
  // `next-intl` translator, and callers rarely memoize an inline handler).
  // Reading them through a ref keeps the fetch effect keyed on the values
  // that actually identify "which credential's pages to load" instead of
  // re-running on every parent render.
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
  }, [credentialId, getCredentialsService]);

  const handleConfirm = async () => {
    if (!selectedAccount) {
      return;
    }

    setIsConnecting(true);
    setError(null);
    const url = `PATCH /credentials/${credentialId}`;

    try {
      const service = await getCredentialsService();
      await service.patch(credentialId, {
        externalAvatar: selectedAccount.image,
        externalHandle: selectedAccount.username,
        externalId: selectedAccount.id,
        externalName: selectedAccount.label,
      });

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
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!isLoading && !error && availableAccounts.length === 0 && (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
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
                <Image
                  src={account.image}
                  alt={account.label}
                  className="size-10 flex-shrink-0 rounded-full object-cover outline-media"
                  width={40}
                  height={40}
                  sizes="40px"
                />
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

      <Button
        label={isConnecting ? translate('confirming') : translate('confirm')}
        onClick={handleConfirm}
        isLoading={isConnecting}
        isDisabled={isConnecting || isLoading || !selectedAccount}
      />
    </div>
  );
}
