'use client';

import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { accountHealthToConnectedAccount } from '@helpers/publisher/connected-account.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import AccountPicker from '@ui/display/connected-account/AccountPicker';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReleaseRailAccountsProps } from '@/features/posts/props/release-rail.props';

function isAccountAtRisk(account: AccountHealthSummary): boolean {
  return Boolean(account.reconnect?.isAvailable);
}

export default function ReleaseRailAccounts({
  brandId,
  onToggle,
  selectedCredentialIds,
}: ReleaseRailAccountsProps) {
  const translate = useTranslations('pages.posts.list.rail');
  const { getToken } = useAuthIdentity();
  const [accounts, setAccounts] = useState<AccountHealthSummary[]>([]);

  // use-effect-audit: ignore abortable request
  useEffect(() => {
    const controller = new AbortController();

    async function loadAccounts() {
      if (!brandId) {
        setAccounts([]);
        return;
      }
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!controller.signal.aborted) {
          setAccounts(summaries);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          logger.error('Failed to load rail account health', error);
        }
      }
    }

    void loadAccounts();

    return () => controller.abort();
  }, [brandId, getToken]);

  if (accounts.length === 0) {
    return null;
  }

  const items = accounts.map((account) => ({
    ...accountHealthToConnectedAccount(account),
    id: account.credentialId,
    warning: isAccountAtRisk(account)
      ? translate('accounts.needsReconnect')
      : undefined,
  }));

  return (
    <AccountPicker
      ariaLabel={translate('accounts.label')}
      items={items}
      onValueChange={(nextIds) => {
        const changed = [
          ...nextIds.filter((id) => !selectedCredentialIds.includes(id)),
          ...selectedCredentialIds.filter((id) => !nextIds.includes(id)),
        ];
        for (const credentialId of changed) {
          onToggle(credentialId);
        }
      }}
      size="sm"
      type="multiple"
      value={selectedCredentialIds}
    />
  );
}
