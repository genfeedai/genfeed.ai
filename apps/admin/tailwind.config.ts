import { baseTailwindConfig } from '@genfeedai/next-config/tailwind';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/**/*.{js,ts,jsx,tsx,mdx}',
    '../../../packages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  presets: [baseTailwindConfig],
};

export default config;
