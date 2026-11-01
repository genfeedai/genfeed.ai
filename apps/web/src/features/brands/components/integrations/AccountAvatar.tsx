'use client';

import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { AccountAvatarProps } from '@props/pages/brand-integrations.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  getConnectionLabel,
  isSocialProfilePlatform,
} from './account-connection-status.util';

// Two sizes: the compact sidebar card (size="md") and the accounts table row
// (size="sm", the default).
const AVATAR_SIZE = {
  md: 'lg',
  sm: 'md',
} as const;

const LOGO_SIZE_CLASSNAME = {
  md: 'size-6',
  sm: 'size-5',
} as const;

/**
 * Avatar with an overlaid circular platform badge.
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
    <Avatar
      alt={translate('profilePictureAlt', { account: label })}
      badge={
        logo ? undefined : (
          <PlatformBadge
            platform={connection.platform}
            showLabel={false}
            variant="solid"
          />
        )
      }
      fallback={logo ?? undefined}
      name={getConnectionLabel(connection)}
      onLoadingStatusChange={(status) => {
        if (status === 'error' && avatarUrl) {
          setFailedAvatarUrl(avatarUrl);
        }
      }}
      referrerPolicy="no-referrer"
      size={AVATAR_SIZE[size]}
      src={avatarUrl}
    />
  );
}
