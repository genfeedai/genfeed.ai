'use client';

import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { toConnectionAccount } from '../account-connection-status.util';

const MAX_VISIBLE = 3;

interface ConnectedAvatarsProps {
  connections: BrandDetailSocialConnection[];
}

/**
 * The accounts already connected on a platform, as overlapping profile
 * pictures. The ring matches the surface the stack sits on so the overlap
 * reads as a cut-out rather than a border.
 */
export default function ConnectedAvatars({
  connections,
}: ConnectedAvatarsProps) {
  const visible = connections.slice(0, MAX_VISIBLE);
  const overflow = connections.length - visible.length;

  return (
    <span className="flex shrink-0 items-center -space-x-1.5">
      {visible.map((connection) => (
        <ConnectedAccountAvatar
          account={toConnectionAccount(connection)}
          hasBadge={false}
          key={connection.credentialId}
          size="sm"
        />
      ))}
      {overflow > 0 ? (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted pl-2 pr-1.5 text-2xs font-medium tabular-nums text-foreground/80 ring-2 ring-card">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
