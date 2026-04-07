import { ComponentSize } from '@genfeedai/enums';
import type { IPlatformBadgeConfig } from '@genfeedai/interfaces/ui/platform-badge-config.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PlatformBadgeProps } from '@props/ui/display/platform-badge.props';
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

const SIZE_CLASSES = {
  [ComponentSize.LG]: {
    container: 'px-2.5 py-1.5 gap-2 text-sm',
    icon: 'w-4 h-4',
  },
  [ComponentSize.MD]: {
    container: 'px-2 py-1 gap-1.5 text-xs',
    icon: 'w-3.5 h-3.5',
  },
  [ComponentSize.SM]: {
    container: 'px-1.5 py-0.5 gap-1 text-xs',
    icon: 'w-3 h-3',
  },
};

const PLATFORM_CONFIGS: Record<string, IPlatformBadgeConfig> = {
  beehiiv: {
    bgColor: 'bg-amber-400/10',
    icon: HiNewspaper,
    iconColor: 'text-amber-500',
    label: 'Beehiiv',
    textColor: 'text-amber-500',
  },
  facebook: {
    bgColor: 'bg-blue-600/10',
    icon: FaFacebook,
    iconColor: 'text-blue-600',
    label: 'Facebook',
    textColor: 'text-blue-600',
  },
  fanvue: {
    bgColor: 'bg-violet-500/10',
    icon: FaStar,
    iconColor: 'text-violet-500',
    label: 'Fanvue',
    textColor: 'text-violet-500',
  },
  ghost: {
    bgColor: 'bg-foreground/10',
    icon: FaGhost,
    iconColor: 'text-foreground',
    label: 'Ghost',
    textColor: 'text-foreground',
  },
  instagram: {
    bgColor: 'bg-pink-500/10',
    icon: FaInstagram,
    iconColor: 'text-pink-500',
    label: 'Instagram',
    textColor: 'text-pink-500',
  },
  linkedin: {
    bgColor: 'bg-blue-700/10',
    icon: FaLinkedin,
    iconColor: 'text-blue-700',
    label: 'LinkedIn',
    textColor: 'text-blue-700',
  },
  mastodon: {
    bgColor: 'bg-indigo-500/10',
    icon: FaMastodon,
    iconColor: 'text-indigo-500',
    label: 'Mastodon',
    textColor: 'text-indigo-500',
  },
  medium: {
    bgColor: 'bg-emerald-600/10',
    icon: FaMedium,
    iconColor: 'text-emerald-600',
    label: 'Medium',
    textColor: 'text-emerald-600',
  },
  pinterest: {
    bgColor: 'bg-red-600/10',
    icon: FaPinterest,
    iconColor: 'text-red-600',
    label: 'Pinterest',
    textColor: 'text-red-600',
  },
  reddit: {
    bgColor: 'bg-orange-500/10',
    icon: FaReddit,
    iconColor: 'text-orange-500',
    label: 'Reddit',
    textColor: 'text-orange-500',
  },
  shopify: {
    bgColor: 'bg-green-500/10',
    icon: FaShopify,
    iconColor: 'text-green-500',
    label: 'Shopify',
    textColor: 'text-green-500',
  },
  snapchat: {
    bgColor: 'bg-yellow-400/10',
    icon: FaSnapchat,
    iconColor: 'text-yellow-500',
    label: 'Snapchat',
    textColor: 'text-yellow-500',
  },
  threads: {
    bgColor: 'bg-foreground/10',
    icon: FaThreads,
    iconColor: 'text-foreground',
    label: 'Threads',
    textColor: 'text-foreground',
  },
  tiktok: {
    bgColor: 'bg-foreground/10',
    icon: FaTiktok,
    iconColor: 'text-foreground',
    label: 'TikTok',
    textColor: 'text-foreground',
  },
  twitter: {
    bgColor: 'bg-foreground/10',
    icon: FaXTwitter,
    iconColor: 'text-foreground',
    label: 'X',
    textColor: 'text-foreground',
  },
  whatsapp: {
    bgColor: 'bg-green-500/10',
    icon: FaWhatsapp,
    iconColor: 'text-green-500',
    label: 'WhatsApp',
    textColor: 'text-green-500',
  },
  wordpress: {
    bgColor: 'bg-sky-700/10',
    icon: FaWordpress,
    iconColor: 'text-sky-700',
    label: 'WordPress',
    textColor: 'text-sky-700',
  },
  x: {
    bgColor: 'bg-foreground/10',
    icon: FaXTwitter,
    iconColor: 'text-foreground',
    label: 'X',
    textColor: 'text-foreground',
  },
  youtube: {
    bgColor: 'bg-red-500/10',
    icon: FaYoutube,
    iconColor: 'text-red-500',
    label: 'YouTube',
    textColor: 'text-red-500',
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
      <Icon className={cn(SIZE_CLASSES[size].icon, config.iconColor)} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
