'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { ReleaseRailAccountsProps } from '@props/publisher/release-rail.props';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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

  return (
    <div
      aria-label={translate('accounts.label')}
      className="flex flex-wrap items-center gap-1.5"
      role="group"
    >
      {accounts.map((account) => {
        const PlatformIcon =
          getPlatformIconComponent(account.platform) ?? ExternalLink;
        const isSelected = selectedCredentialIds.includes(account.credentialId);
        const isAtRisk = isAccountAtRisk(account);
        const label = account.handle || account.label;

        const chip = (
          <Button
            aria-pressed={isSelected}
            ariaLabel={translate('accounts.ariaToggle', { account: label })}
            className="gap-1.5"
            onClick={() => onToggle(account.credentialId)}
            size={ButtonSize.SM}
            variant={isSelected ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
            withWrapper={false}
          >
            <PlatformIcon className="size-3.5 shrink-0" />
            <span className="max-w-32 truncate">{label}</span>
            {isAtRisk ? <Badge variant="warning">!</Badge> : null}
          </Button>
        );

        return (
          <span key={account.credentialId}>
            {isAtRisk ? (
              <SimpleTooltip label={translate('accounts.needsReconnect')}>
                {chip}
              </SimpleTooltip>
            ) : (
              chip
            )}
          </span>
        );
      })}
    </div>
  );
}
