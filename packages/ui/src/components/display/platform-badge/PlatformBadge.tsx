import { ComponentSize } from '@genfeedai/contracts';
import type { IPlatformBadgeConfig } from '@genfeedai/contracts/interfaces/ui/platform-badge-config.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  DevIcon,
  FacebookIcon,
  GhostIcon,
  HackerNewsIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  MediumIcon,
  PinterestIcon,
  ProductHuntIcon,
  RedditIcon,
  ShopifyIcon,
  SnapchatIcon,
  ThreadsIcon,
  TiktokIcon,
  WhatsappIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { PlatformBadgeProps } from '@genfeedai/props/ui/display/platform-badge.props';
import { Newspaper, Star } from 'lucide-react';

const SIZE_CLASSES = {
  [ComponentSize.LG]: {
    container: 'px-2.5 py-1.5 gap-2 text-sm',
    icon: 'size-4',
  },
  [ComponentSize.MD]: {
    container: 'px-2 py-1 gap-1.5 text-xs',
    icon: 'size-3.5',
  },
  [ComponentSize.SM]: {
    container: 'px-1.5 py-0.5 gap-1 text-xs',
    icon: 'size-3',
  },
};

const PLATFORM_CONFIGS: Record<string, IPlatformBadgeConfig> = {
  beehiiv: {
    bgColor: 'bg-platform-beehiiv/10',
    icon: Newspaper,
    iconColor: 'text-platform-beehiiv',
    label: 'Beehiiv',
    textColor: 'text-foreground',
  },
  devto: {
    bgColor: 'bg-foreground/10',
    icon: DevIcon,
    iconColor: 'text-foreground',
    label: 'DEV',
    textColor: 'text-foreground',
  },
  facebook: {
    bgColor: 'bg-platform-facebook/10',
    icon: FacebookIcon,
    iconColor: 'text-platform-facebook',
    label: 'Facebook',
    textColor: 'text-foreground',
  },
  fanvue: {
    bgColor: 'bg-platform-fanvue/10',
    icon: Star,
    iconColor: 'text-platform-fanvue',
    label: 'Fanvue',
    textColor: 'text-foreground',
  },
  ghost: {
    bgColor: 'bg-foreground/10',
    icon: GhostIcon,
    iconColor: 'text-foreground',
    label: 'Ghost',
    textColor: 'text-foreground',
  },
  hacker_news: {
    bgColor: 'bg-platform-hacker_news/10',
    icon: HackerNewsIcon,
    iconColor: 'text-platform-hacker_news',
    label: 'Hacker News',
    textColor: 'text-foreground',
  },
  instagram: {
    bgColor: 'bg-platform-instagram/10',
    icon: InstagramIcon,
    iconColor: 'text-platform-instagram',
    label: 'Instagram',
    textColor: 'text-foreground',
  },
  linkedin: {
    bgColor: 'bg-platform-linkedin/10',
    icon: LinkedinIcon,
    iconColor: 'text-platform-linkedin',
    label: 'LinkedIn',
    textColor: 'text-foreground',
  },
  mastodon: {
    bgColor: 'bg-platform-mastodon/10',
    icon: MastodonIcon,
    iconColor: 'text-platform-mastodon',
    label: 'Mastodon',
    textColor: 'text-foreground',
  },
  medium: {
    bgColor: 'bg-platform-medium/10',
    icon: MediumIcon,
    iconColor: 'text-platform-medium',
    label: 'Medium',
    textColor: 'text-foreground',
  },
  pinterest: {
    bgColor: 'bg-platform-pinterest/10',
    icon: PinterestIcon,
    iconColor: 'text-platform-pinterest',
    label: 'Pinterest',
    textColor: 'text-foreground',
  },
  product_hunt: {
    bgColor: 'bg-platform-product_hunt/10',
    icon: ProductHuntIcon,
    iconColor: 'text-platform-product_hunt',
    label: 'Product Hunt',
    textColor: 'text-foreground',
  },
  reddit: {
    bgColor: 'bg-platform-reddit/10',
    icon: RedditIcon,
    iconColor: 'text-platform-reddit',
    label: 'Reddit',
    textColor: 'text-foreground',
  },
  shopify: {
    bgColor: 'bg-platform-shopify/10',
    icon: ShopifyIcon,
    iconColor: 'text-platform-shopify',
    label: 'Shopify',
    textColor: 'text-foreground',
  },
  snapchat: {
    bgColor: 'bg-platform-snapchat/10',
    icon: SnapchatIcon,
    iconColor: 'text-platform-snapchat',
    label: 'Snapchat',
    textColor: 'text-foreground',
  },
  threads: {
    bgColor: 'bg-foreground/10',
    icon: ThreadsIcon,
    iconColor: 'text-foreground',
    label: 'Threads',
    textColor: 'text-foreground',
  },
  tiktok: {
    bgColor: 'bg-platform-tiktok/10',
    icon: TiktokIcon,
    iconColor: 'text-platform-tiktok',
    label: 'TikTok',
    textColor: 'text-foreground',
  },
  twitter: {
    bgColor: 'bg-platform-twitter/10',
    icon: XTwitterIcon,
    iconColor: 'text-foreground',
    label: 'X',
    textColor: 'text-foreground',
  },
  whatsapp: {
    bgColor: 'bg-platform-whatsapp/10',
    icon: WhatsappIcon,
    iconColor: 'text-platform-whatsapp',
    label: 'WhatsApp',
    textColor: 'text-foreground',
  },
  wordpress: {
    bgColor: 'bg-platform-wordpress/10',
    icon: WordpressIcon,
    iconColor: 'text-platform-wordpress',
    label: 'WordPress',
    textColor: 'text-foreground',
  },
  x: {
    bgColor: 'bg-platform-twitter/10',
    icon: XTwitterIcon,
    iconColor: 'text-foreground',
    label: 'X',
    textColor: 'text-foreground',
  },
  youtube: {
    bgColor: 'bg-platform-youtube/10',
    icon: YoutubeIcon,
    iconColor: 'text-platform-youtube',
    label: 'YouTube',
    textColor: 'text-foreground',
  },
};

function getPlatformConfig(platform: string): IPlatformBadgeConfig | null {
  const key = platform?.toLowerCase();
  return PLATFORM_CONFIGS[key] ?? null;
}

/**
 * Platform badge with icon, label, and platform-specific colors
 * Use this for consistent platform display across tables and lists
 */
export default function PlatformBadge({
  platform,
  className,
  showLabel = true,
  size = ComponentSize.MD,
}: PlatformBadgeProps) {
  const config = getPlatformConfig(platform);

  if (!config) {
    return <span className="text-foreground/50">-</span>;
  }

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium',
        config.bgColor,
        config.textColor,
        SIZE_CLASSES[size].container,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(SIZE_CLASSES[size].icon, config.iconColor)}
      />
      {showLabel && <span>{config.label}</span>}
      {!showLabel && <span className="sr-only">{config.label}</span>}
    </span>
  );
}
