import { ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailConnectedAccountProps } from '@props/pages/brand-detail.props';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AccountAvatar from '@/features/brands/components/integrations/AccountAvatar';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
} from '@/features/brands/components/integrations/account-connection-status.util';

const LEADING_AT_SIGN_PATTERN = /^@/;

export default function ConnectedAccount({
  connection,
  isSelected = false,
  onSelect,
}: BrandDetailConnectedAccountProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const label = getConnectionLabel(connection);
  const needsReconnect =
    getAccountConnectionStatus(connection) === 'needsReconnect';
  const content = (
    <>
      <AccountAvatar connection={connection} size="md" />

      <span className="min-w-0 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="block truncate text-sm font-medium">{label}</span>
          {needsReconnect ? (
            <SimpleTooltip label={translate('needsReconnect')}>
              <span
                aria-label={translate('needsReconnect')}
                className="gen-dot gen-dot-warning shrink-0"
                role="img"
              />
            </SimpleTooltip>
          ) : null}
        </span>
        {connection.handle ? (
          <span className="block truncate text-xs text-muted-foreground">
            @{connection.handle.replace(LEADING_AT_SIGN_PATTERN, '')}
          </span>
        ) : null}
      </span>
    </>
  );
  const className = `flex min-w-0 items-center gap-3 rounded-md px-3 py-2 shadow-border transition-colors ${
    isSelected
      ? 'bg-background ring-1 ring-primary/40'
      : 'bg-card hover:bg-background'
  }`;

  const profileLink = connection.url ? (
    <Link
      href={connection.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={translate('openProfileAria', {
        account: label,
        platform: connection.platform,
      })}
      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      {translate('openProfile', { account: label })}
    </Link>
  ) : null;

  if (onSelect) {
    return (
      <div className={`${className} justify-between`}>
        <Button
          aria-pressed={isSelected}
          className="min-w-0 flex-1 justify-start gap-3 p-0"
          onClick={() => onSelect(connection.credentialId)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {content}
        </Button>
        {profileLink}
      </div>
    );
  }

  if (!connection.url) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      href={connection.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={translate('openProfileAria', {
        account: label,
        platform: connection.platform,
      })}
      className={className}
    >
      {content}
    </Link>
  );
}
