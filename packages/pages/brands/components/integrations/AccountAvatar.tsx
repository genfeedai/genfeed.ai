'use client';

import type { AccountAvatarProps } from '@props/pages/brand-integrations.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';
import {
  getConnectionInitials,
  getConnectionLabel,
} from './account-connection-status.util';

// Sized to match the two call sites this replaces: the compact sidebar
// card's own inline avatar (size="md") and the accounts table row's
// IntegrationAccountRow avatar (size="sm", the default). Background and
// fallback text size differed between them too — kept per-size rather than
// unified so switching either call site to AccountAvatar changed nothing.
const AVATAR_SIZE_CLASSNAME = {
  md: 'size-10',
  sm: 'size-8',
} as const;

const AVATAR_BG_CLASSNAME = {
  md: 'bg-background',
  sm: 'bg-background-secondary',
} as const;

const FALLBACK_TEXT_CLASSNAME = {
  md: 'text-xs',
  sm: 'text-2xs',
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
        className={`${AVATAR_SIZE_CLASSNAME[size]} ${AVATAR_BG_CLASSNAME[size]} shadow-border`}
      >
        {connection.avatarUrl ? (
          <AvatarImage
            src={connection.avatarUrl}
            alt={translate('profilePictureAlt', { account: label })}
            className="object-cover"
          />
        ) : null}
        <AvatarFallback
          className={`${FALLBACK_TEXT_CLASSNAME[size]} font-semibold text-foreground/70`}
        >
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
