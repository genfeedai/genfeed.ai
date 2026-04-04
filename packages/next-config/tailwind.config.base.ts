import type { Config } from 'tailwindcss';

/** Platform brand colors (kept in sync with packages/constants/src/platform-colors.ts) */
const PLATFORM_COLORS = {
  beehiiv: '#FCD34D',
  discord: '#5865F2',
  facebook: '#1877F2',
  fanvue: '#6C63FF',
  ghost: '#15171A',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  mastodon: '#6364FF',
  medium: '#00ab6c',
  notion: '#000000',
  pinterest: '#E60023',
  reddit: '#FF4500',
  shopify: '#96BF48',
  slack: '#4A154B',
  snapchat: '#FFFC00',
  substack: '#FF6719',
  telegram: '#26A5E4',
  threads: '#000000',
  tiktok: '#FE2C55',
  twitch: '#9146FF',
  twitter: '#1DA1F2',
  whatsapp: '#25D366',
  wordpress: '#21759B',
  youtube: '#FF0000',
};

const PLATFORM_TOKEN_COLORS = {
  'platform-discord': 'var(--platform-discord)',
  'platform-facebook': 'var(--platform-facebook)',
  'platform-instagram': 'var(--platform-instagram)',
  'platform-linkedin': 'var(--platform-linkedin)',
  'platform-pinterest': 'var(--platform-pinterest)',
  'platform-reddit': 'var(--platform-reddit)',
  'platform-tiktok': 'var(--platform-tiktok)',
  'platform-tiktok-cyan': 'var(--platform-tiktok-cyan)',
  'platform-twitter': 'var(--platform-twitter)',
};

/**
 * Base Tailwind config shared across all web apps.
 * Use as a preset in each app's tailwind.config.ts:
 *   presets: [baseTailwindConfig]
 *
 * Design: subtle border radius (4px) on interactive elements.
 * Use `rounded-none` explicitly for sharp-edge layout containers.
 * `rounded-full` (9999px) preserved for intentionally circular elements.
 */
export const baseTailwindConfig: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    '../../../packages/**/*.{js,ts,jsx,tsx,mdx}',
    // External @genfeedai packages (npm) — scan for Tailwind class usage
    '../../../node_modules/@genfeedai/workflow-ui/dist/**/*.mjs',
  ],
  theme: {
    borderRadius: {
      '2xl': '0.75rem',
      '3xl': '1rem',
      DEFAULT: '0.25rem',
      full: '9999px',
      lg: '0.5rem',
      md: '0.375rem',
      none: '0',
      sm: '0.25rem',
      xl: '0.625rem',
    },
    extend: {
      animation: {
        'collapsible-down': 'collapsible-down 200ms ease-out',
        'collapsible-up': 'collapsible-up 200ms ease-out',
      },
      colors: {
        ...PLATFORM_TOKEN_COLORS,
        platform: PLATFORM_COLORS,
      },
      height: {
        chart: '300px',
        'chart-sm': '280px',
      },
      keyframes: {
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
      },
      maxHeight: {
        dropdown: '300px',
      },
      maxWidth: {
        'truncate-lg': '200px',
        'truncate-md': '140px',
        'truncate-sm': '100px',
      },
      minHeight: {
        card: '160px',
        'code-block': '180px',
        'code-block-lg': '280px',
        form: '400px',
        textarea: '60px',
        'textarea-lg': '80px',
      },
      minWidth: {
        'badge-md': '32px',
        'badge-sm': '28px',
        'badge-xs': '24px',
        node: '180px',
        'onboarding-btn': '140px',
        'skill-col': '200px',
      },
    },
  },
};

export default baseTailwindConfig;
