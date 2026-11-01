'use client';

import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { Badge } from '@ui/primitives/badge';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReleaseRailAccountsProps } from '@/features/posts/props/release-rail.props';

function isAccountAtRisk(account: AccountHealthSummary): boolean {
  return account.holdPublishing || Boolean(account.reconnect?.isAvailable);
}

export default function ReleaseRailAccounts({
  brandId,
  onToggle,
  selectedCredentialIds,
}: ReleaseRailAccountsProps) {
  const translate = useTranslations('pages.posts.list.rail');
  const { getToken } = useAuthIdentity();
  const [accounts, setAccounts] = useState<AccountHealthSummary[]>([]);

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

  const options = accounts.map((account) => {
    const PlatformIcon =
      getPlatformIconComponent(account.platform) ?? ExternalLink;
    const label = account.handle || account.label;

    return {
      ariaLabel: translate('accounts.ariaToggle', { account: label }),
      icon: <PlatformIcon className="size-3.5 shrink-0" />,
      label: (
        <>
          <span className="max-w-32 truncate">{label}</span>
          {isAccountAtRisk(account) ? <Badge variant="warning">!</Badge> : null}
        </>
      ),
      tooltip: isAccountAtRisk(account)
        ? translate('accounts.needsReconnect')
        : undefined,
      value: account.credentialId,
    };
  });

  return (
    <SegmentedControl
      appearance="chip"
      ariaLabel={translate('accounts.label')}
      onValueChange={(nextIds) => {
        const changed = [
          ...nextIds.filter((id) => !selectedCredentialIds.includes(id)),
          ...selectedCredentialIds.filter((id) => !nextIds.includes(id)),
        ];
        for (const credentialId of changed) {
          onToggle(credentialId);
        }
      }}
      options={options}
      size="sm"
      type="multiple"
      value={selectedCredentialIds}
    />
  );
}
