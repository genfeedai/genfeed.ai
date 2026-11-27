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
 * One platform as a compact card: icon beside the name, the status under it
 * and the avatars or a plus at the end. Connected platforms stay clickable so a
 * second account can be added; only an in-flight connect disables it.
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
        max={2}
        size="sm"
      />
    ) : status === 'connecting' ? (
      <Spinner
        ariaLabel={caption}
        className="shrink-0"
        size={ComponentSize.XS}
      />
    ) : (
      <Plus
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
      />
    );

  return (
    <Button
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 text-left shadow-border transition-colors',
        'hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card',
      )}
      isDisabled={connectingPlatform !== null}
      onClick={() => onConnect(item)}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-tertiary">
        <Icon className={cn('size-4', item.iconClassName)} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-4 text-foreground">
          {item.label}
        </span>
        <span className="block truncate text-xs leading-4 text-muted-foreground">
          {caption}
        </span>
      </span>
      {trailing}
    </Button>
  );
}
