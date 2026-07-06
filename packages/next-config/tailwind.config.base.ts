import type { Config } from 'tailwindcss';

/** Platform brand colors (kept in sync with packages/constants/src/platform-colors.ts) */
export const PLATFORM_COLORS = {
  beehiiv: '#FCD34D',
  discord: '#5865F2',
  facebook: '#1877F2',
  fanvue: '#6C63FF',
  ghost: '#15171A',
  hacker_news: '#FF6600',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  mastodon: '#6364FF',
  medium: '#00AB6C',
  notion: '#000000',
  pinterest: '#E60023',
  product_hunt: '#DA552F',
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

export const PLATFORM_TOKEN_COLORS = Object.fromEntries(
  Object.keys(PLATFORM_COLORS).map((platform) => [
    `platform-${platform}`,
    `var(--platform-${platform})`,
  ]),
) as Record<`platform-${keyof typeof PLATFORM_COLORS}`, string>;

/**
 * Base Tailwind config shared across all web apps.
 * Use as a preset in each app's tailwind.config.ts:
 *   presets: [baseTailwindConfig]
 *
 * Radius is owned entirely by the v4 `@theme` block in
 * packages/styles/globals.css (single source of truth, mirrors
 * packages/ui/web-tokens.css). `rounded-none`/`rounded-full`/`rounded`
 * fall back to Tailwind v4 built-ins. Do not redefine borderRadius here.
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
