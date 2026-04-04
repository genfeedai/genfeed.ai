import type { ComponentType, ReactElement } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaStar,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';

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
    Icon: FaFacebook,
  },
  fanvue: {
    colorClass: 'text-violet-500',
    displayName: 'FanvueIcon',
    Icon: FaStar,
  },
  instagram: {
    colorClass: 'text-pink-500',
    displayName: 'InstagramIcon',
    Icon: FaInstagram,
  },
  linkedin: {
    colorClass: 'text-blue-700',
    displayName: 'LinkedInIcon',
    Icon: FaLinkedin,
  },
  tiktok: {
    colorClass: 'text-foreground',
    displayName: 'TikTokIcon',
    Icon: FaTiktok,
  },
  twitter: {
    colorClass: 'text-foreground',
    displayName: 'TwitterIcon',
    Icon: FaXTwitter,
  },
  x: {
    colorClass: 'text-foreground',
    displayName: 'TwitterIcon',
    Icon: FaXTwitter,
  },
  youtube: {
    colorClass: 'text-red-500',
    displayName: 'YouTubeIcon',
    Icon: FaYoutube,
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
