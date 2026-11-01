'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DirectMessageReconnectNoticeProps } from '@/features/messages/props/direct-message-reconnect-notice.props';

/**
 * Tells the user an X account must reconnect before its DMs can sync, with a
 * reconnect action per account. Shared by Messages and the X account card so
 * both say the same thing.
 */
export default function DirectMessageReconnectNotice({
  accounts,
  isDisabled = false,
  onReconnect,
  reconnectingCredentialId = null,
}: DirectMessageReconnectNoticeProps) {
  const translate = useTranslations('common.messages.dmReconnect');

  if (accounts.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <AlertTitle>{translate('title')}</AlertTitle>
          <AlertDescription>
            {translate('description', { count: accounts.length })}
          </AlertDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <Button
              icon={<RefreshCw aria-hidden="true" className="size-3.5" />}
              isDisabled={isDisabled || reconnectingCredentialId !== null}
              isLoading={reconnectingCredentialId === account.credentialId}
              key={account.credentialId}
              label={
                accounts.length === 1
                  ? translate('action')
                  : translate('actionForAccount', { account: account.label })
              }
              onClick={() => onReconnect(account.credentialId)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ))}
        </div>
      </div>
    </Alert>
  );
}
