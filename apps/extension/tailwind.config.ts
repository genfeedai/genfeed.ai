import { baseTailwindConfig } from '@genfeedai/next-config/tailwind';
import { tailwindSemanticColors } from '@genfeedai/ui';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  plugins: [],
  presets: [baseTailwindConfig],
  theme: {
    extend: {
      colors: tailwindSemanticColors,
    },
  },
};

export default config;
