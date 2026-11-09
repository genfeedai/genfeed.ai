import { CredentialPlatform } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  RedditIcon,
  ThreadsIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { ProfileSocialLinksProps } from '@props/content/profile.props';

const SOCIAL_ICONS: Partial<
  Record<CredentialPlatform, { icon: IconType; label: string }>
> = {
  [CredentialPlatform.FACEBOOK]: { icon: FacebookIcon, label: 'Facebook' },
  [CredentialPlatform.INSTAGRAM]: { icon: InstagramIcon, label: 'Instagram' },
  [CredentialPlatform.LINKEDIN]: { icon: LinkedinIcon, label: 'LinkedIn' },
  [CredentialPlatform.PINTEREST]: { icon: PinterestIcon, label: 'Pinterest' },
  [CredentialPlatform.REDDIT]: { icon: RedditIcon, label: 'Reddit' },
  [CredentialPlatform.THREADS]: { icon: ThreadsIcon, label: 'Threads' },
  [CredentialPlatform.TIKTOK]: { icon: TiktokIcon, label: 'TikTok' },
  [CredentialPlatform.TWITTER]: { icon: XTwitterIcon, label: 'X' },
  [CredentialPlatform.YOUTUBE]: { icon: YoutubeIcon, label: 'YouTube' },
};

/** The social accounts the creator connected, as links to their profiles. */
export default function ProfileSocialLinks({
  handle,
  socials = [],
}: ProfileSocialLinksProps) {
  const links = socials.flatMap((social) => {
    const config = SOCIAL_ICONS[social.platform];
    return config ? [{ ...social, ...config }] : [];
  });

  if (links.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Socials" className="flex flex-wrap gap-4">
      {links.map(({ handle: account, icon: Icon, label, platform, url }) => (
        <li key={platform}>
          <a
            aria-label={`${label}: @${account}`}
            className="text-foreground/60 transition-colors hover:text-foreground"
            href={addUTMParameters(url, handle)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon className="text-2xl" />
          </a>
        </li>
      ))}
    </ul>
  );
}
