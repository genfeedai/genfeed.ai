import type { ITrendPlatformConfig } from '@genfeedai/interfaces/analytics/platform-config.interface';
import { PLATFORM_COLORS } from '@genfeedai/constants';
import {
  FaFacebook,
  FaGhost,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaMedium,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSnapchat,
  FaStar,
  FaThreads,
  FaTiktok,
  FaWhatsapp,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiNewspaper } from 'react-icons/hi2';

export const PLATFORM_CONFIGS: Record<string, ITrendPlatformConfig> = {
  beehiiv: {
    color: PLATFORM_COLORS.beehiiv.base,
    description: 'Newsletter publishing',
    icon: HiNewspaper,
    id: 'beehiiv',
    label: 'Beehiiv',
  },
  facebook: {
    color: PLATFORM_COLORS.facebook.base,
    description: 'Videos & posts',
    icon: FaFacebook,
    id: 'facebook',
    label: 'Facebook',
  },
  fanvue: {
    color: PLATFORM_COLORS.fanvue.base,
    description: 'Premium content',
    icon: FaStar,
    id: 'fanvue',
    label: 'Fanvue',
  },
  ghost: {
    color: PLATFORM_COLORS.ghost.base,
    description: 'Blog publishing',
    icon: FaGhost,
    id: 'ghost',
    label: 'Ghost',
  },
  instagram: {
    color: PLATFORM_COLORS.instagram.base,
    description: 'Reels & carousels',
    icon: FaInstagram,
    id: 'instagram',
    label: 'Instagram',
  },
  linkedin: {
    color: PLATFORM_COLORS.linkedin.base,
    description: 'Professional content',
    icon: FaLinkedin,
    id: 'linkedin',
    label: 'LinkedIn',
  },
  mastodon: {
    color: PLATFORM_COLORS.mastodon.base,
    description: 'Decentralized social',
    icon: FaMastodon,
    id: 'mastodon',
    label: 'Mastodon',
  },
  medium: {
    color: PLATFORM_COLORS.medium.base,
    description: 'Long-form articles',
    icon: FaMedium,
    id: 'medium',
    label: 'Medium',
  },
  pinterest: {
    color: PLATFORM_COLORS.pinterest.base,
    description: 'Visual discovery',
    icon: FaPinterest,
    id: 'pinterest',
    label: 'Pinterest',
  },
  reddit: {
    color: PLATFORM_COLORS.reddit.base,
    description: 'Community trends',
    icon: FaReddit,
    id: 'reddit',
    label: 'Reddit',
  },
  shopify: {
    color: PLATFORM_COLORS.shopify.base,
    description: 'E-commerce content',
    icon: FaShopify,
    id: 'shopify',
    label: 'Shopify',
  },
  snapchat: {
    color: PLATFORM_COLORS.snapchat.base,
    description: 'Stories & snaps',
    icon: FaSnapchat,
    id: 'snapchat',
    label: 'Snapchat',
  },
  threads: {
    color: PLATFORM_COLORS.threads.base,
    description: 'Text-first social',
    icon: FaThreads,
    id: 'threads',
    label: 'Threads',
  },
  tiktok: {
    color: PLATFORM_COLORS.tiktok.base,
    description: 'Short-form virality',
    icon: FaTiktok,
    id: 'tiktok',
    label: 'TikTok',
  },
  twitter: {
    color: PLATFORM_COLORS.twitter.base,
    description: 'Threads & videos',
    icon: FaXTwitter,
    id: 'twitter',
    label: 'X',
  },
  whatsapp: {
    color: PLATFORM_COLORS.whatsapp.base,
    description: 'Business messaging',
    icon: FaWhatsapp,
    id: 'whatsapp',
    label: 'WhatsApp',
  },
  wordpress: {
    color: PLATFORM_COLORS.wordpress.base,
    description: 'Blog & CMS',
    icon: FaWordpress,
    id: 'wordpress',
    label: 'WordPress',
  },
  youtube: {
    color: PLATFORM_COLORS.youtube.base,
    description: 'Long-form & Shorts',
    icon: FaYoutube,
    id: 'youtube',
    label: 'YouTube',
  },
};

export const PLATFORM_CONFIGS_ARRAY: ITrendPlatformConfig[] =
  Object.values(PLATFORM_CONFIGS);

export function getPlatformConfig(platformId: string): ITrendPlatformConfig {
  return PLATFORM_CONFIGS[platformId] ?? PLATFORM_CONFIGS.tiktok;
}
