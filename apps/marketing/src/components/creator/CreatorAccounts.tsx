import { formatPlatformLabel } from '@genfeedai/contracts';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { CreatorAccountsProps } from '@props/content/creator.props';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import SocialAccountLink from './SocialAccountLink';
import { getSocialAppUrl } from './social-app-link';

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
            <SocialAccountLink
              appUrl={appUrl}
              label={`${formatPlatformLabel(social.platform) ?? social.platform}: @${social.handle}`}
              webUrl={webUrl}
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
            </SocialAccountLink>
          </li>
        );
      })}
    </ul>
  );
}
