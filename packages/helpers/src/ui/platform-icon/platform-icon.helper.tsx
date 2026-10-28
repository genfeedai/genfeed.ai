import { formatPlatformLabel, Platform } from '@genfeedai/contracts';
import type { IPlatformBadgeConfig } from '@genfeedai/contracts/interfaces/ui/platform-badge-config.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import {
  DevIcon,
  DiscordIcon,
  FacebookIcon,
  GhostIcon,
  GoogleAdsIcon,
  GoogleIcon,
  HackerNewsIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  MediumIcon,
  MetaIcon,
  PinterestIcon,
  ProductHuntIcon,
  RedditIcon,
  ShopifyIcon,
  SlackIcon,
  SnapchatIcon,
  TelegramIcon,
  ThreadsIcon,
  TiktokIcon,
  TwitchIcon,
  WhatsappIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Newspaper, Star } from 'lucide-react';
import type { ReactElement } from 'react';

function label(platform: Platform | string): string {
  return formatPlatformLabel(platform) ?? platform;
}

const X_BRAND: IPlatformBadgeConfig = {
  bgColor: 'bg-platform-twitter/10',
  icon: XTwitterIcon,
  iconColor: 'text-foreground',
  label: label(Platform.TWITTER),
  solidBgColor: 'bg-black',
  textColor: 'text-foreground',
};

/**
 * The one platform brand table: logo, brand-token colours and display label.
 * PlatformBadge, getPlatformIcon and getPlatformIconComponent all read it, so
 * a platform looks the same wherever it appears.
 */
const PLATFORM_BRANDS: Record<string, IPlatformBadgeConfig> = {
  [Platform.BEEHIIV]: {
    bgColor: 'bg-platform-beehiiv/10',
    icon: Newspaper,
    iconColor: 'text-platform-beehiiv',
    label: label(Platform.BEEHIIV),
    solidBgColor: 'bg-platform-beehiiv',
    textColor: 'text-foreground',
  },
  [Platform.DEV_TO]: {
    bgColor: 'bg-foreground/10',
    icon: DevIcon,
    iconColor: 'text-foreground',
    label: label(Platform.DEV_TO),
    solidBgColor: 'bg-platform-devto',
    textColor: 'text-foreground',
  },
  [Platform.DISCORD]: {
    bgColor: 'bg-platform-discord/10',
    icon: DiscordIcon,
    iconColor: 'text-platform-discord',
    label: label(Platform.DISCORD),
    solidBgColor: 'bg-platform-discord',
    textColor: 'text-foreground',
  },
  [Platform.FACEBOOK]: {
    bgColor: 'bg-platform-facebook/10',
    icon: FacebookIcon,
    iconColor: 'text-platform-facebook',
    label: label(Platform.FACEBOOK),
    solidBgColor: 'bg-platform-facebook',
    textColor: 'text-foreground',
  },
  [Platform.FANVUE]: {
    bgColor: 'bg-platform-fanvue/10',
    icon: Star,
    iconColor: 'text-platform-fanvue',
    label: label(Platform.FANVUE),
    solidBgColor: 'bg-platform-fanvue',
    textColor: 'text-foreground',
  },
  [Platform.GHOST]: {
    bgColor: 'bg-foreground/10',
    icon: GhostIcon,
    iconColor: 'text-foreground',
    label: label(Platform.GHOST),
    solidBgColor: 'bg-platform-ghost',
    textColor: 'text-foreground',
  },
  [Platform.GOOGLE_ADS]: {
    bgColor: 'bg-foreground/10',
    // GoogleAdsIcon carries the three brand fills; the class only sizes it.
    icon: GoogleAdsIcon,
    iconColor: 'text-foreground',
    label: label(Platform.GOOGLE_ADS),
    // The mark is multi-coloured, so it sits on a white chip in the solid variant.
    solidBgColor: 'bg-white',
    textColor: 'text-foreground',
  },
  [Platform.GOOGLE_SEARCH_CONSOLE]: {
    bgColor: 'bg-foreground/10',
    icon: GoogleIcon,
    iconColor: 'text-foreground',
    label: label(Platform.GOOGLE_SEARCH_CONSOLE),
    solidBgColor: 'bg-white',
    textColor: 'text-foreground',
  },
  [Platform.HACKER_NEWS]: {
    bgColor: 'bg-platform-hacker_news/10',
    icon: HackerNewsIcon,
    iconColor: 'text-platform-hacker_news',
    label: label(Platform.HACKER_NEWS),
    solidBgColor: 'bg-platform-hacker_news',
    textColor: 'text-foreground',
  },
  [Platform.INSTAGRAM]: {
    bgColor: 'bg-platform-instagram/10',
    icon: InstagramIcon,
    iconColor: 'text-platform-instagram',
    label: label(Platform.INSTAGRAM),
    solidBgColor: 'bg-platform-instagram',
    textColor: 'text-foreground',
  },
  [Platform.LINKEDIN]: {
    bgColor: 'bg-platform-linkedin/10',
    icon: LinkedinIcon,
    iconColor: 'text-platform-linkedin',
    label: label(Platform.LINKEDIN),
    solidBgColor: 'bg-platform-linkedin',
    textColor: 'text-foreground',
  },
  [Platform.MASTODON]: {
    bgColor: 'bg-platform-mastodon/10',
    icon: MastodonIcon,
    iconColor: 'text-platform-mastodon',
    label: label(Platform.MASTODON),
    solidBgColor: 'bg-platform-mastodon',
    textColor: 'text-foreground',
  },
  // Ads research names the ad networks, which are not publishing platforms.
  google: {
    bgColor: 'bg-foreground/10',
    icon: GoogleIcon,
    iconColor: 'text-foreground',
    label: label('google'),
    solidBgColor: 'bg-white',
    textColor: 'text-foreground',
  },
  meta: {
    bgColor: 'bg-platform-facebook/10',
    icon: MetaIcon,
    iconColor: 'text-platform-facebook',
    label: label('meta'),
    solidBgColor: 'bg-platform-facebook',
    textColor: 'text-foreground',
  },
  [Platform.MEDIUM]: {
    bgColor: 'bg-platform-medium/10',
    icon: MediumIcon,
    iconColor: 'text-platform-medium',
    label: label(Platform.MEDIUM),
    solidBgColor: 'bg-platform-medium',
    textColor: 'text-foreground',
  },
  [Platform.PINTEREST]: {
    bgColor: 'bg-platform-pinterest/10',
    icon: PinterestIcon,
    iconColor: 'text-platform-pinterest',
    label: label(Platform.PINTEREST),
    solidBgColor: 'bg-platform-pinterest',
    textColor: 'text-foreground',
  },
  [Platform.PRODUCT_HUNT]: {
    bgColor: 'bg-platform-product_hunt/10',
    icon: ProductHuntIcon,
    iconColor: 'text-platform-product_hunt',
    label: label(Platform.PRODUCT_HUNT),
    solidBgColor: 'bg-platform-product_hunt',
    textColor: 'text-foreground',
  },
  [Platform.REDDIT]: {
    bgColor: 'bg-platform-reddit/10',
    icon: RedditIcon,
    iconColor: 'text-platform-reddit',
    label: label(Platform.REDDIT),
    solidBgColor: 'bg-platform-reddit',
    textColor: 'text-foreground',
  },
  [Platform.SHOPIFY]: {
    bgColor: 'bg-platform-shopify/10',
    icon: ShopifyIcon,
    iconColor: 'text-platform-shopify',
    label: label(Platform.SHOPIFY),
    solidBgColor: 'bg-platform-shopify',
    textColor: 'text-foreground',
  },
  [Platform.SLACK]: {
    bgColor: 'bg-platform-slack/10',
    icon: SlackIcon,
    iconColor: 'text-platform-slack',
    label: label(Platform.SLACK),
    solidBgColor: 'bg-platform-slack',
    textColor: 'text-foreground',
  },
  [Platform.SNAPCHAT]: {
    bgColor: 'bg-platform-snapchat/10',
    icon: SnapchatIcon,
    iconColor: 'text-platform-snapchat',
    label: label(Platform.SNAPCHAT),
    solidBgColor: 'bg-platform-snapchat',
    textColor: 'text-foreground',
  },
  [Platform.TELEGRAM]: {
    bgColor: 'bg-platform-telegram/10',
    icon: TelegramIcon,
    iconColor: 'text-platform-telegram',
    label: label(Platform.TELEGRAM),
    solidBgColor: 'bg-platform-telegram',
    textColor: 'text-foreground',
  },
  [Platform.THREADS]: {
    bgColor: 'bg-foreground/10',
    icon: ThreadsIcon,
    iconColor: 'text-foreground',
    label: label(Platform.THREADS),
    solidBgColor: 'bg-platform-threads',
    textColor: 'text-foreground',
  },
  [Platform.TIKTOK]: {
    bgColor: 'bg-platform-tiktok/10',
    icon: TiktokIcon,
    iconColor: 'text-platform-tiktok',
    label: label(Platform.TIKTOK),
    // TikTok's mark is black; #fe2c55 is only its accent and reads as an error.
    solidBgColor: 'bg-black',
    textColor: 'text-foreground',
  },
  [Platform.TWITCH]: {
    bgColor: 'bg-platform-twitch/10',
    icon: TwitchIcon,
    iconColor: 'text-platform-twitch',
    label: label(Platform.TWITCH),
    solidBgColor: 'bg-platform-twitch',
    textColor: 'text-foreground',
  },
  [Platform.TWITTER]: X_BRAND,
  [Platform.WHATSAPP]: {
    bgColor: 'bg-platform-whatsapp/10',
    icon: WhatsappIcon,
    iconColor: 'text-platform-whatsapp',
    label: label(Platform.WHATSAPP),
    solidBgColor: 'bg-platform-whatsapp',
    textColor: 'text-foreground',
  },
  [Platform.WORDPRESS]: {
    bgColor: 'bg-platform-wordpress/10',
    icon: WordpressIcon,
    iconColor: 'text-platform-wordpress',
    label: label(Platform.WORDPRESS),
    solidBgColor: 'bg-platform-wordpress',
    textColor: 'text-foreground',
  },
  [Platform.X_ADS]: { ...X_BRAND, label: label(Platform.X_ADS) },
  [Platform.YOUTUBE]: {
    bgColor: 'bg-platform-youtube/10',
    icon: YoutubeIcon,
    iconColor: 'text-platform-youtube',
    label: label(Platform.YOUTUBE),
    solidBgColor: 'bg-platform-youtube',
    textColor: 'text-foreground',
  },
  x: X_BRAND,
};

/** Brand for a platform value, OAuth path (`google-ads`) or free-text name; null when unknown. */
export function getPlatformBrand(
  platform: string | null | undefined,
): IPlatformBadgeConfig | null {
  if (typeof platform !== 'string') {
    return null;
  }
  const key = platform.trim().toLowerCase().replaceAll('-', '_');
  return PLATFORM_BRANDS[key] ?? null;
}

export function getPlatformIcon(
  platform: string,
  className: string = 'w-4 h-4',
): ReactElement | null {
  const brand = getPlatformBrand(platform);
  if (!brand) {
    return null;
  }

  const Icon = brand.icon;
  return <Icon className={`${className} ${brand.iconColor}`} />;
}

export function getPlatformIconComponent(
  platform: string,
): IconComponent | undefined {
  const brand = getPlatformBrand(platform);
  if (!brand) {
    return undefined;
  }

  const { icon: Icon, iconColor, label: name } = brand;
  const WrappedIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <Icon className={`${className} ${iconColor}`} />
  );
  WrappedIcon.displayName = `${name}Icon`;
  return WrappedIcon;
}
