'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { ConnectedAccountAvatarProps } from '@genfeedai/props/ui/display/connected-account.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { getConnectedAccountText } from './connected-account.util';

// Platforms whose connection is an ad or analytics account: no profile
// picture exists, so the platform logo is the avatar and the corner badge
// would only repeat it. A platform shown before any account is connected (a
// platform picker) has no picture, handle or name either: same treatment.
const LOGO_AVATAR_PLATFORMS = new Set<string>([CredentialPlatform.GOOGLE_ADS]);

/**
 * The one connected-account picture: the account's real avatar with its
 * platform logo on the corner. Profile pictures come from third-party CDNs
 * that expire links or refuse hotlinking, so the image is requested without a
 * referrer and falls back to initials when it fails to load.
 */
export default function ConnectedAccountAvatar({
  account,
  className,
  hasBadge = true,
  isDecorative = false,
  size = 'md',
}: ConnectedAccountAvatarProps) {
  const { name, primary } = getConnectedAccountText(account);
  const isPlatformOnly = !account.avatarUrl && !account.handle && !account.name;
  const isLogoAvatar =
    !account.avatarUrl &&
    (LOGO_AVATAR_PLATFORMS.has(account.platform) || isPlatformOnly);

  const avatar = (
    <Avatar
      badge={
        isLogoAvatar || !hasBadge ? undefined : (
          <PlatformBadge
            platform={account.platform}
            showLabel={false}
            variant="solid"
          />
        )
      }
      className={className}
      fallback={
        isLogoAvatar ? getPlatformIcon(account.platform, 'size-1/2') : undefined
      }
      name={name ?? primary}
      referrerPolicy="no-referrer"
      size={size}
      src={account.avatarUrl}
      title={primary}
    />
  );

  if (!isDecorative) {
    return avatar;
  }

  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      {avatar}
    </span>
  );
}
