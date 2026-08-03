import {
  FacebookIcon,
  GoogleIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  PinterestIcon,
  RedditIcon,
  ShopifyIcon,
  SnapchatIcon,
  ThreadsIcon,
  TiktokIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Star } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

type IconComponent = ComponentType<{ className?: string }>;

interface PlatformIconConfig {
  Icon: IconComponent;
  colorClass: string;
  displayName: string;
}

const PLATFORM_ICONS: Record<string, PlatformIconConfig> = {
  facebook: {
    colorClass: 'text-blue-600',
    displayName: 'FacebookIcon',
    Icon: FacebookIcon,
  },
  fanvue: {
    colorClass: 'text-violet-500',
    displayName: 'FanvueIcon',
    Icon: Star,
  },
  google_ads: {
    colorClass: 'text-foreground',
    displayName: 'GoogleAdsIcon',
    Icon: GoogleIcon,
  },
  instagram: {
    colorClass: 'text-pink-500',
    displayName: 'InstagramIcon',
    Icon: InstagramIcon,
  },
  linkedin: {
    colorClass: 'text-blue-700',
    displayName: 'LinkedInIcon',
    Icon: LinkedinIcon,
  },
  mastodon: {
    colorClass: 'text-foreground',
    displayName: 'MastodonIcon',
    Icon: MastodonIcon,
  },
  pinterest: {
    colorClass: 'text-red-600',
    displayName: 'PinterestIcon',
    Icon: PinterestIcon,
  },
  reddit: {
    colorClass: 'text-orange-500',
    displayName: 'RedditIcon',
    Icon: RedditIcon,
  },
  shopify: {
    colorClass: 'text-green-600',
    displayName: 'ShopifyIcon',
    Icon: ShopifyIcon,
  },
  snapchat: {
    colorClass: 'text-yellow-400',
    displayName: 'SnapchatIcon',
    Icon: SnapchatIcon,
  },
  threads: {
    colorClass: 'text-foreground',
    displayName: 'ThreadsIcon',
    Icon: ThreadsIcon,
  },
  tiktok: {
    colorClass: 'text-foreground',
    displayName: 'TikTokIcon',
    Icon: TiktokIcon,
  },
  twitter: {
    colorClass: 'text-foreground',
    displayName: 'TwitterIcon',
    Icon: XTwitterIcon,
  },
  wordpress: {
    colorClass: 'text-blue-500',
    displayName: 'WordPressIcon',
    Icon: WordpressIcon,
  },
  x: {
    colorClass: 'text-foreground',
    displayName: 'TwitterIcon',
    Icon: XTwitterIcon,
  },
  youtube: {
    colorClass: 'text-red-500',
    displayName: 'YouTubeIcon',
    Icon: YoutubeIcon,
  },
};

export function getPlatformIcon(
  platform: string,
  className: string = 'w-4 h-4',
): ReactElement | null {
  const config = PLATFORM_ICONS[platform?.toLowerCase()];
  if (!config) {
    return null;
  }

  const { Icon, colorClass } = config;
  return <Icon className={`${className} ${colorClass}`} />;
}

export function getPlatformIconComponent(
  platform: string,
): IconComponent | undefined {
  const config = PLATFORM_ICONS[platform?.toLowerCase()];
  if (!config) {
    return undefined;
  }

  const { Icon, colorClass, displayName } = config;
  const WrappedIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <Icon className={`${className} ${colorClass}`} />
  );
  WrappedIcon.displayName = displayName;
  return WrappedIcon;
}
