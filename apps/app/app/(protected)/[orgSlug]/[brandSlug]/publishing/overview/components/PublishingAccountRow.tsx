import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import AccountCell from '@pages/brands/components/integrations/AccountCell';
import type { PublishingAccountRowProps } from '@props/publisher/publishing-overview.props';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function PublishingAccountRow({
  accountLabel,
  children,
  connections,
  credentialId,
  meta,
  platform,
  reconnectLabel,
}: PublishingAccountRowProps) {
  const { href } = useOrgUrl();
  const connection = connections.find(
    (account) =>
      account.credentialId === credentialId && account.platform === platform,
  ) ?? { credentialId, name: accountLabel, platform };

  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:px-5">
      <div className="min-w-0 flex-1 space-y-2">
        <AccountCell connection={connection} />
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {children}
        </div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
      {reconnectLabel ? (
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          className="self-start shrink-0"
        >
          <Link href={href(APP_ROUTES.SETTINGS.SOCIAL)}>
            {reconnectLabel}
            <span className="sr-only">
              {' '}
              — {accountLabel} ({platform})
            </span>
          </Link>
        </Button>
      ) : null}
    </li>
  );
}
