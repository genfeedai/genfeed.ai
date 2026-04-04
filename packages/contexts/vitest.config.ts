import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@contexts': path.resolve(__dirname, '.'),
      '@genfeedai/constants': require.resolve('@genfeedai/constants'),
      '@genfeedai/enums': require.resolve('@genfeedai/enums'),
      '@helpers': path.resolve(__dirname, '../helpers/src'),
      '@hooks': path.resolve(__dirname, '../hooks'),
      '@models': path.resolve(__dirname, '../models'),
      '@props': path.resolve(__dirname, '../props'),
      '@providers': path.resolve(__dirname, '../providers'),
      '@services': path.resolve(__dirname, '../services'),
      '@ui': path.resolve(__dirname, '../ui'),
      '@utils': path.resolve(__dirname, '../utils'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    globals: true,
    include: ['**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
