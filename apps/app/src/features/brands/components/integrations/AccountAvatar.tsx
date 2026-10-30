'use client';

import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { AccountAvatarProps } from '@props/pages/brand-integrations.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  getConnectionInitials,
  getConnectionLabel,
  isSocialProfilePlatform,
} from './account-connection-status.util';

// Two sizes: the compact sidebar card (size="md") and the accounts table row
// (size="sm", the default).
const AVATAR_SIZE_CLASSNAME = {
  md: 'size-10',
  sm: 'size-8',
} as const;

const FALLBACK_TEXT_CLASSNAME = {
  md: 'text-xs',
  sm: 'text-2xs',
} as const;

const LOGO_SIZE_CLASSNAME = {
  md: 'size-6',
  sm: 'size-5',
} as const;

// The badge sits on the avatar's bottom-right edge and a ring in the surface
// colour separates it from the picture. It stays small enough that the
// initials fallback is never covered.
const BADGE_SIZE_CLASSNAME = {
  md: 'size-4 [&_svg]:size-2.5',
  sm: 'size-3.5 [&_svg]:size-2',
} as const;

/**
 * Avatar with an overlaid circular platform badge.
 *
 * The overlay wrapper needs `flex` on top of `absolute` — without it the
 * badge's own inline layout collapses its rounded corners into a pill
 * instead of a circle (see #4677).
 *
 * Profile pictures come from third-party CDNs that expire links or refuse
 * hotlinked requests, so the image is requested without a referrer and a
 * picture that fails to load drops back to the initials instead of leaving a
 * broken-image glyph inside the circle.
 */
export default function AccountAvatar({
  connection,
  size = 'sm',
}: AccountAvatarProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const label = getConnectionLabel(connection);
  // Ad accounts have no profile picture, so the initials ("S" for an account
  // named shipshit.dev) say nothing — the platform logo is the avatar instead,
  // which also makes the corner badge redundant.
  const avatarUrl =
    connection.avatarUrl && connection.avatarUrl !== failedAvatarUrl
      ? connection.avatarUrl
      : null;
  const isLogoAvatar =
    !avatarUrl && !isSocialProfilePlatform(connection.platform);
  const logo = isLogoAvatar
    ? getPlatformIcon(connection.platform, LOGO_SIZE_CLASSNAME[size])
    : null;

  return (
    <span className="relative shrink-0">
      <Avatar
        className={`${AVATAR_SIZE_CLASSNAME[size]} bg-muted shadow-border`}
      >
        {avatarUrl ? (
          <AvatarImage
            src={avatarUrl}
            alt={translate('profilePictureAlt', { account: label })}
            className="object-cover"
            referrerPolicy="no-referrer"
            onError={() => setFailedAvatarUrl(avatarUrl)}
          />
        ) : null}
        <AvatarFallback
          className={`${FALLBACK_TEXT_CLASSNAME[size]} font-semibold uppercase text-foreground/80`}
        >
          {logo ?? getConnectionInitials(connection)}
        </AvatarFallback>
      </Avatar>
      {logo ? null : (
        <span className="absolute -bottom-0.5 -right-0.5 flex rounded-full ring-2 ring-background">
          <PlatformBadge
            platform={connection.platform}
            showLabel={false}
            variant="solid"
            className={`${BADGE_SIZE_CLASSNAME[size]} justify-center rounded-full p-0`}
          />
        </span>
      )}
    </span>
  );
}
