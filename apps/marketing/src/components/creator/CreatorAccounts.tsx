'use client';

import { formatPlatformLabel } from '@genfeedai/contracts';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { CreatorAccountsProps } from '@props/content/creator.props';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import {
  getSocialAppUrl,
  isMobileDevice,
  openSocialApp,
} from './social-app-link';

/**
 * The social accounts the creator connected: each one's picture with its
 * platform logo on the corner, linking to the account. On a phone, a tap opens
 * the network's app when it has one, and the web page when the app is missing.
 */
export default function CreatorAccounts({
  brand,
  handle,
}: CreatorAccountsProps): React.ReactElement | null {
  const socials = brand.socials ?? [];

  if (socials.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Socials" className="flex items-center gap-3">
      {socials.map((social) => {
        const webUrl = addUTMParameters(social.url, handle);
        const appUrl = getSocialAppUrl(social.platform, social.handle);

        return (
          <li key={`${social.platform}:${social.handle}`}>
            <a
              aria-label={`${formatPlatformLabel(social.platform) ?? social.platform}: @${social.handle}`}
              className="inline-flex rounded-full"
              href={webUrl}
              onClick={(event) => {
                if (appUrl && isMobileDevice()) {
                  event.preventDefault();
                  openSocialApp(appUrl, webUrl);
                }
              }}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ConnectedAccountAvatar
                account={{
                  avatarUrl: brand.logoUrl,
                  handle: social.handle,
                  platform: social.platform,
                }}
                isDecorative
                size="md"
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
