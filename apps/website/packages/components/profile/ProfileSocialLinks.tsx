'use client';

import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  InstagramIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { ProfileSocialLinksProps } from '@props/content/profile.props';

interface SocialLinkConfig {
  url: string | undefined;
  icon: IconType;
  label: string;
}

export default function ProfileSocialLinks({
  handle,
  youtubeUrl,
  tiktokUrl,
  instagramUrl,
  twitterUrl,
}: ProfileSocialLinksProps) {
  const socialLinks: SocialLinkConfig[] = [
    { icon: YoutubeIcon, label: 'YouTube', url: youtubeUrl },
    { icon: TiktokIcon, label: 'TikTok', url: tiktokUrl },
    { icon: InstagramIcon, label: 'Instagram', url: instagramUrl },
    { icon: XTwitterIcon, label: 'Twitter', url: twitterUrl },
  ];

  const activeLinks = socialLinks.filter(
    (link): link is SocialLinkConfig & { url: string } => Boolean(link.url),
  );

  if (activeLinks.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-center gap-4 pt-8">
      {activeLinks.map(({ url, icon: Icon, label }) => (
        <a
          key={label}
          href={addUTMParameters(url, handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-surface/60 hover:text-surface transition-colors"
          aria-label={label}
        >
          <Icon className="text-2xl" />
        </a>
      ))}
    </div>
  );
}
