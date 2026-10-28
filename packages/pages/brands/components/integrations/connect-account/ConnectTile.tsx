'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import type { ConnectAccountPlatform } from '@props/pages/brand-integrations.props';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ConnectedAvatars from './ConnectedAvatars';
import {
  getConnectReasonKey,
  getConnectTileStatus,
} from './connect-account.util';

interface ConnectTileProps {
  connections: BrandDetailSocialConnection[];
  connectingPlatform: string | null;
  item: ConnectAccountPlatform;
  onConnect: (item: ConnectAccountPlatform) => void;
}

/**
 * One platform. Connected platforms stay clickable so a second account can be
 * added; only an unavailable platform or an in-flight connect disables it.
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
  const reasonKey = getConnectReasonKey(item);

  let caption: string;
  if (status === 'connecting') {
    caption = translate('connectingEllipsis');
  } else if (reasonKey) {
    caption = translate(reasonKey);
  } else if (status === 'connected') {
    caption = translate('connectedCount', { count: connections.length });
  } else {
    caption = translate('connect');
  }

  const trailing =
    status === 'connected' ? (
      <ConnectedAvatars connections={connections} />
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
        'group flex w-full flex-col gap-3 rounded-xl bg-background-secondary p-3 text-left shadow-border transition-colors',
        'hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background-secondary',
      )}
      isDisabled={!item.isConnectAvailable || connectingPlatform !== null}
      onClick={() => onConnect(item)}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-tertiary">
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
