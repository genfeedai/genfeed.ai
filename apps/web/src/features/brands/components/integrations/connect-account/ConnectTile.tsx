'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import type { ConnectAccountPlatform } from '@props/pages/brand-integrations.props';
import ConnectedAccountStack from '@ui/display/connected-account/ConnectedAccountStack';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toConnectionAccount } from '../account-connection-status.util';
import { getConnectTileStatus } from './connect-account.util';

interface ConnectTileProps {
  connections: BrandDetailSocialConnection[];
  connectingPlatform: string | null;
  item: ConnectAccountPlatform;
  onConnect: (item: ConnectAccountPlatform) => void;
}

/**
 * One platform. Connected platforms stay clickable so a second account can be
 * added; only an in-flight connect disables it.
 */
export default function ConnectTile({
  connections,
  connectingPlatform,
  item,
  onConnect,
}: ConnectTileProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const { Icon } = item;
  const status = getConnectTileStatus(item, connections, connectingPlatform);

  let caption: string;
  if (status === 'connecting') {
    caption = translate('connectingEllipsis');
  } else if (status === 'connected') {
    caption = translate('connectedCount', { count: connections.length });
  } else {
    caption = translate('connect');
  }

  const trailing =
    status === 'connected' ? (
      <ConnectedAccountStack
        hasBadge={false}
        isInteractive={false}
        items={connections.map((connection) => ({
          ...toConnectionAccount(connection),
          id: connection.credentialId,
        }))}
        size="sm"
      />
    ) : status === 'connecting' ? (
      <Spinner
        ariaLabel={caption}
        className="shrink-0"
        size={ComponentSize.XS}
      />
    ) : status === 'idle' ? (
      <Plus
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
      />
    ) : null;

  return (
    <Button
      className={cn(
        'group flex w-full flex-col gap-3 rounded-xl bg-card p-3 text-left shadow-border transition-colors',
        'hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card',
      )}
      isDisabled={connectingPlatform !== null}
      onClick={() => onConnect(item)}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tertiary">
          <Icon className={cn('size-4', item.iconClassName)} />
        </span>
        {trailing}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {item.label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {caption}
        </span>
      </span>
    </Button>
  );
}
