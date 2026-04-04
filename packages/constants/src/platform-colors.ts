export const PLATFORM_COLORS = {
  beehiiv: {
    base: '#FCD34D',
    hover: '#fde68a',
    name: 'Beehiiv',
    rgb: '252, 211, 77',
  },
  discord: {
    base: '#5865F2',
    hover: '#7289da',
    name: 'Discord',
    rgb: '88, 101, 242',
  },
  facebook: {
    base: '#1877F2',
    hover: '#2196f3',
    name: 'Facebook',
    rgb: '24, 119, 242',
  },
  fanvue: {
    base: '#6C63FF',
    hover: '#8B85FF',
    name: 'Fanvue',
    rgb: '108, 99, 255',
  },
  ghost: {
    base: '#15171A',
    hover: '#2e3035',
    name: 'Ghost',
    rgb: '21, 23, 26',
  },
  instagram: {
    base: '#E1306C',
    hover: '#ff4081',
    name: 'Instagram',
    rgb: '225, 48, 108',
  },
  linkedin: {
    base: '#0A66C2',
    hover: '#1976d2',
    name: 'LinkedIn',
    rgb: '10, 102, 194',
  },
  mastodon: {
    base: '#6364FF',
    hover: '#7b7cff',
    name: 'Mastodon',
    rgb: '99, 100, 255',
  },
  medium: {
    base: '#00ab6c',
    hover: '#00c77f',
    name: 'Medium',
    rgb: '0, 171, 108',
  },
  notion: {
    base: '#000000',
    hover: '#333333',
    name: 'Notion',
    rgb: '0, 0, 0',
  },
  pinterest: {
    base: '#E60023',
    hover: '#ff1744',
    name: 'Pinterest',
    rgb: '230, 0, 35',
  },

  reddit: {
    base: '#FF4500',
    hover: '#ff6333',
    name: 'Reddit',
    rgb: '255, 69, 0',
  },
  shopify: {
    base: '#96BF48',
    hover: '#a8d455',
    name: 'Shopify',
    rgb: '150, 191, 72',
  },
  slack: {
    base: '#4A154B',
    hover: '#611f69',
    name: 'Slack',
    rgb: '74, 21, 75',
  },
  snapchat: {
    base: '#FFFC00',
    hover: '#fffb33',
    name: 'Snapchat',
    rgb: '255, 252, 0',
  },
  substack: {
    base: '#FF6719',
    hover: '#ff8542',
    name: 'Substack',
    rgb: '255, 103, 25',
  },
  telegram: {
    base: '#26A5E4',
    hover: '#3db8f5',
    name: 'Telegram',
    rgb: '38, 165, 228',
  },
  threads: {
    base: '#000000',
    hover: '#333333',
    name: 'Threads',
    rgb: '0, 0, 0',
  },
  tiktok: {
    base: '#FE2C55',
    hover: '#ff1744',
    name: 'TikTok',
    rgb: '254, 44, 85',
  },
  twitch: {
    base: '#9146FF',
    hover: '#a970ff',
    name: 'Twitch',
    rgb: '145, 70, 255',
  },
  twitter: {
    base: '#1DA1F2',
    hover: '#42a5f5',
    name: 'X (Twitter)',
    rgb: '29, 161, 242',
  },
  whatsapp: {
    base: '#25D366',
    hover: '#34eb7a',
    name: 'WhatsApp',
    rgb: '37, 211, 102',
  },
  wordpress: {
    base: '#21759B',
    hover: '#2e8aba',
    name: 'WordPress',
    rgb: '33, 117, 155',
  },
  youtube: {
    base: '#FF0000',
    hover: '#ff3333',
    name: 'YouTube',
    rgb: '255, 0, 0',
  },
} as const;

export type PlatformId = keyof typeof PLATFORM_COLORS;

export type ColorVariant = 'base' | 'hover';

export const DISCORD_EMBED_COLORS: Record<string, number> = {
  BEEHIIV: 0xfcd34d,
  DEFAULT: 0x5865f2,
  DISCORD: 0x5865f2,
  FACEBOOK: 0x1877f2,
  FANVUE: 0x6c63ff,
  GHOST: 0x15171a,
  GOOGLE_ADS: 0x4285f4,
  INSTAGRAM: 0xe1306c,
  LINKEDIN: 0x0a66c2,
  MASTODON: 0x6364ff,
  MEDIUM: 0x00ab6c,
  PINTEREST: 0xe60023,
  REDDIT: 0xff4500,
  SHOPIFY: 0x96bf48,
  SLACK: 0x4a154b,
  SNAPCHAT: 0xfffc00,
  SUBSTACK: 0xff6719,
  TELEGRAM: 0x26a5e4,
  THREADS: 0x000000,
  TIKTOK: 0xfe2c55,
  TWITCH: 0x9146ff,
  TWITTER: 0x1da1f2,
  WHATSAPP: 0x25d366,
  WORDPRESS: 0x21759b,
  YOUTUBE: 0xff0000,
};

export function getPlatformDisplayName(platform?: string): string {
  if (!platform) {
    return 'Unknown';
  }

  const key = platform.toLowerCase() as PlatformId;
  const platformData = PLATFORM_COLORS[key];

  if (platformData) {
    return platformData.name;
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

export function getDiscordEmbedColor(platform?: string): number {
  if (!platform) {
    return DISCORD_EMBED_COLORS.DEFAULT;
  }

  const key = platform.toUpperCase();
  return DISCORD_EMBED_COLORS[key] ?? DISCORD_EMBED_COLORS.DEFAULT;
}
