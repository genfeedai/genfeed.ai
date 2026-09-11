'use client';

import type { AccountAvatarProps } from '@props/pages/brand-integrations.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';
import {
  getConnectionInitials,
  getConnectionLabel,
} from './account-connection-status.util';

const AVATAR_SIZE_CLASSNAME = {
  md: 'size-10',
  sm: 'size-8',
} as const;

const BADGE_SIZE_CLASSNAME = {
  md: 'size-4',
  sm: 'size-3.5',
} as const;

/**
 * Avatar with an overlaid circular platform badge.
 *
 * The overlay wrapper needs `flex` on top of `absolute` — without it the
 * badge's own inline layout collapses its rounded corners into a pill
 * instead of a circle (see #4677).
 */
export default function AccountAvatar({
  connection,
  size = 'sm',
}: AccountAvatarProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const label = getConnectionLabel(connection);

  return (
    <span className="relative shrink-0">
      <Avatar
        className={`${AVATAR_SIZE_CLASSNAME[size]} bg-background-secondary shadow-border`}
      >
        {connection.avatarUrl ? (
          <AvatarImage
            src={connection.avatarUrl}
            alt={translate('profilePictureAlt', { account: label })}
            className="object-cover"
          />
        ) : null}
        <AvatarFallback className="text-2xs font-semibold text-foreground/70">
          {getConnectionInitials(connection)}
        </AvatarFallback>
      </Avatar>
      <span className="absolute -bottom-1 -right-1 flex rounded-full bg-background p-0.5 shadow-border-strong">
        <PlatformBadge
          platform={connection.platform}
          showLabel={false}
          className={`${BADGE_SIZE_CLASSNAME[size]} justify-center rounded-full p-0`}
        />
      </span>
    </span>
  );
}
