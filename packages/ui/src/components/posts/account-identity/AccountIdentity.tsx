'use client';

import type { AccountIdentityProps } from '@genfeedai/props/components/account-identity.props';
import { Avatar } from '@ui/primitives/avatar';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import type { ReactNode } from 'react';

/**
 * The one way Genfeed shows "who posts this": the account avatar with the
 * platform logo in its corner, the account name, and the handle underneath.
 * Previews and the post inspector both render it, so a surface never adds a
 * second platform header above the account.
 */
export default function AccountIdentity({
  name,
  handle,
  avatarUrl,
  avatarAlt,
  platformLabel,
  PlatformIcon,
  meta,
}: AccountIdentityProps): ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative shrink-0">
        <Avatar
          alt={avatarAlt}
          name={name}
          referrerPolicy="no-referrer"
          size="lg"
          src={avatarUrl}
        />
        {PlatformIcon ? (
          <SimpleTooltip label={platformLabel}>
            <span
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-foreground"
              role="img"
              aria-label={platformLabel}
            >
              <PlatformIcon className="size-3" />
            </span>
          </SimpleTooltip>
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {handle || meta ? (
          <p className="truncate text-xs text-muted-foreground">
            {handle}
            {handle && meta ? <> · </> : null}
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
