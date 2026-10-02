import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const extensionAppDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: false,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(extensionAppDir, './node_modules/react'),
      'react-dom': path.resolve(extensionAppDir, './node_modules/react-dom'),
      '@genfeedai/auth-client/react': path.resolve(
        extensionAppDir,
        '../../../../packages/auth-client/src/react.tsx',
      ),
      '@genfeedai/helpers/formatting/cn/cn.util': path.resolve(
        extensionAppDir,
        '../../../../packages/helpers/src/formatting/cn/cn.util.ts',
      ),
      '@genfeedai/helpers/formatting/cn': path.resolve(
        extensionAppDir,
        '../../../../packages/helpers/src/formatting/cn/index.ts',
      ),
      '@genfeedai/agent': path.resolve(
        extensionAppDir,
        '../../../../packages/agent/src',
      ),
      '@helpers': path.resolve(
        extensionAppDir,
        '../../../../packages/helpers/src',
      ),
      '@hooks': path.resolve(extensionAppDir, './src/hooks'),
      '@ui': path.resolve(extensionAppDir, '../../../../packages/ui/src'),
      '~': path.resolve(extensionAppDir, './src'),
      '~components': path.resolve(extensionAppDir, './src/components'),
      '~hooks': path.resolve(extensionAppDir, './src/hooks'),
      '~models': path.resolve(extensionAppDir, './src/models'),
      '~platforms': path.resolve(extensionAppDir, './src/platforms'),
      '~popup': path.resolve(extensionAppDir, './src/popup.tsx'),
      '~services': path.resolve(extensionAppDir, './src/services'),
      '~store': path.resolve(extensionAppDir, './src/store'),
      '~theme': path.resolve(extensionAppDir, './src/theme'),
      '~style.css': path.resolve(extensionAppDir, './src/style.css'),
      '~utils': path.resolve(extensionAppDir, './src/utils'),
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  test: {
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: [
            'react',
            'react-dom/client',
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-slot',
          ],
        },
      },
    },
    server: { deps: { inline: [/react/, /@radix-ui/] } },
    coverage: {
      all: false,
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'build/',
        '.plasmo/',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 8, functions: 8, lines: 13, statements: 12 },
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
