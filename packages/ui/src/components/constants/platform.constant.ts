import { PLATFORM_COLORS } from '@genfeedai/contracts/constants';
import type { ITrendPlatformConfig } from '@genfeedai/contracts/interfaces/analytics/platform-config.interface';
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
import { Newspaper, Star } from 'lucide-react';

export const PLATFORM_CONFIGS: Record<string, ITrendPlatformConfig> = {
  beehiiv: {
    color: PLATFORM_COLORS.beehiiv.base,
    description: 'Newsletter publishing',
    icon: Newspaper,
    id: 'beehiiv',
    label: 'Beehiiv',
  },
  devto: {
    color: PLATFORM_COLORS.devto.base,
    description: 'Developer articles',
    icon: DevIcon,
    id: 'devto',
    label: 'DEV',
  },
  facebook: {
    color: PLATFORM_COLORS.facebook.base,
    description: 'Videos & posts',
    icon: FacebookIcon,
    id: 'facebook',
    label: 'Facebook',
  },
  fanvue: {
    color: PLATFORM_COLORS.fanvue.base,
    description: 'Premium content',
    icon: Star,
    id: 'fanvue',
    label: 'Fanvue',
  },
  ghost: {
    color: PLATFORM_COLORS.ghost.base,
    description: 'Blog publishing',
    icon: GhostIcon,
    id: 'ghost',
    label: 'Ghost',
  },
  hacker_news: {
    color: PLATFORM_COLORS.hacker_news.base,
    description: 'Show HN launch',
    icon: HackerNewsIcon,
    id: 'hacker_news',
    label: 'Hacker News',
  },
  instagram: {
    color: PLATFORM_COLORS.instagram.base,
    description: 'Reels & carousels',
    icon: InstagramIcon,
    id: 'instagram',
    label: 'Instagram',
  },
  linkedin: {
    color: PLATFORM_COLORS.linkedin.base,
    description: 'Professional content',
    icon: LinkedinIcon,
    id: 'linkedin',
    label: 'LinkedIn',
  },
  mastodon: {
    color: PLATFORM_COLORS.mastodon.base,
    description: 'Decentralized social',
    icon: MastodonIcon,
    id: 'mastodon',
    label: 'Mastodon',
  },
  medium: {
    color: PLATFORM_COLORS.medium.base,
    description: 'Long-form articles',
    icon: MediumIcon,
    id: 'medium',
    label: 'Medium',
  },
  pinterest: {
    color: PLATFORM_COLORS.pinterest.base,
    description: 'Visual discovery',
    icon: PinterestIcon,
    id: 'pinterest',
    label: 'Pinterest',
  },
  product_hunt: {
    color: PLATFORM_COLORS.product_hunt.base,
    description: 'Product launch',
    icon: ProductHuntIcon,
    id: 'product_hunt',
    label: 'Product Hunt',
  },
  reddit: {
    color: PLATFORM_COLORS.reddit.base,
    description: 'Community trends',
    icon: RedditIcon,
    id: 'reddit',
    label: 'Reddit',
  },
  shopify: {
    color: PLATFORM_COLORS.shopify.base,
    description: 'E-commerce content',
    icon: ShopifyIcon,
    id: 'shopify',
    label: 'Shopify',
  },
  snapchat: {
    color: PLATFORM_COLORS.snapchat.base,
    description: 'Stories & snaps',
    icon: SnapchatIcon,
    id: 'snapchat',
    label: 'Snapchat',
  },
  threads: {
    color: PLATFORM_COLORS.threads.base,
    description: 'Text-first social',
    icon: ThreadsIcon,
    id: 'threads',
    label: 'Threads',
  },
  tiktok: {
    color: PLATFORM_COLORS.tiktok.base,
    description: 'Short-form virality',
    icon: TiktokIcon,
    id: 'tiktok',
    label: 'TikTok',
  },
  twitter: {
    color: PLATFORM_COLORS.twitter.base,
    description: 'Threads & videos',
    icon: XTwitterIcon,
    id: 'twitter',
    label: 'X',
  },
  whatsapp: {
    color: PLATFORM_COLORS.whatsapp.base,
    description: 'Business messaging',
    icon: WhatsappIcon,
    id: 'whatsapp',
    label: 'WhatsApp',
  },
  wordpress: {
    color: PLATFORM_COLORS.wordpress.base,
    description: 'Blog & CMS',
    icon: WordpressIcon,
    id: 'wordpress',
    label: 'WordPress',
  },
  youtube: {
    color: PLATFORM_COLORS.youtube.base,
    description: 'Long-form & Shorts',
    icon: YoutubeIcon,
    id: 'youtube',
    label: 'YouTube',
  },
};

export const PLATFORM_CONFIGS_ARRAY: ITrendPlatformConfig[] =
  Object.values(PLATFORM_CONFIGS);

export function getPlatformConfig(platformId: string): ITrendPlatformConfig {
  return PLATFORM_CONFIGS[platformId] ?? PLATFORM_CONFIGS.tiktok;
}
