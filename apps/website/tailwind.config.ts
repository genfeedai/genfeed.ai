import { baseTailwindConfig } from '@genfeedai/next-config/tailwind';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/**/*.{js,ts,jsx,tsx,mdx}',
    '../../../packages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  presets: [baseTailwindConfig],
  theme: {
    extend: {
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      colors: {
        platform: {
          discord: '#5865F2',
          'discord-dark': '#4752c4',
          instagram: '#E4405F',
          tiktok: '#000000',
          twitter: '#1DA1F2',
          youtube: '#FF0000',
        },
      },
      fontFamily: {
        sans: ['Satoshi', 'sans-serif'],
        serif: ['Zodiak', 'serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
    },
  },
};

export default config;
