import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  createVitestWarningLogger,
  installVitestWarningFilter,
} from '../configs/vitest-warning-filter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = process.cwd();
const localUiRoot = path.resolve(appRoot, './packages/ui');
const hasLocalUiRoot = fs.existsSync(localUiRoot);
const sharedUiRoot = path.resolve(__dirname, '../packages/ui/src/components');
installVitestWarningFilter();
const customLogger = createVitestWarningLogger();

export default defineConfig({
  customLogger,
  root: appRoot,
  resolve: {
    alias: [
      {
        find: '@app',
        replacement: path.resolve(appRoot, './app'),
      },
      {
        find: '@app-components',
        replacement: path.resolve(appRoot, './packages/components'),
      },
      {
        find: '@app-server',
        replacement: path.resolve(appRoot, './packages/server'),
      },
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.resolve(
          __dirname,
          '../packages/constants/dist/index.js',
        ),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../packages/constants/dist/$1.js',
        ),
      },
      {
        find: /^@genfeedai\/fonts$/,
        replacement: path.resolve(__dirname, '../packages/fonts/index.ts'),
      },
      {
        find: /^@genfeedai\/fonts\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/fonts/$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.resolve(__dirname, '../packages/enums/dist/index.js'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/enums/dist/$1.js'),
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../packages/contexts'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/helpers/src/$1'),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: path.resolve(
          __dirname,
          '../packages/helpers/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/helpers/src/$1'),
      },
      {
        find: '@hooks',
        replacement: path.resolve(__dirname, '../packages/hooks'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../packages/props'),
      },
      {
        find: '@providers',
        replacement: path.resolve(__dirname, '../packages/providers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../packages/services'),
      },
      {
        find: '@public',
        replacement: path.resolve(appRoot, './app/(public)'),
      },
      {
        find: /^@public\/(.*)$/,
        replacement: path.resolve(appRoot, './app/(public)/$1'),
      },
      {
        find: '@protected',
        replacement: path.resolve(appRoot, './app/(protected)'),
      },
      {
        find: /^@protected\/(.*)$/,
        replacement: path.resolve(appRoot, './app/(protected)/$1'),
      },
      {
        find: '@pages',
        replacement: path.resolve(appRoot, './src/page-modules'),
      },
      {
        find: /^@pages\/(.*)$/,
        replacement: path.resolve(appRoot, './src/page-modules/$1'),
      },
      {
        find: '@website',
        replacement: appRoot,
      },
      {
        find: /^@website\/(.*)$/,
        replacement: `${appRoot}/$1`,
      },
      {
        find: '@web-components',
        replacement: path.resolve(appRoot, './packages/components'),
      },
      {
        find: /^@web-components\/(.*)$/,
        replacement: path.resolve(appRoot, './packages/components/$1'),
      },
      {
        find: '@styles',
        replacement: path.resolve(__dirname, '../packages/styles'),
      },
      {
        find: /^@styles\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/styles/$1'),
      },
      {
        find: '@shared',
        replacement: path.resolve(__dirname, '../tests'),
      },
      {
        find: /^@shared\/(.*)$/,
        replacement: path.resolve(__dirname, '../tests/$1'),
      },
      ...(hasLocalUiRoot
        ? [
            {
              find: '@ui/providers',
              replacement: path.resolve(localUiRoot, './providers'),
            },
            {
              find: /^@ui\/providers\/(.*)$/,
              replacement: path.resolve(localUiRoot, './providers/$1'),
            },
            {
              find: '@ui/marketing/PricingStrip',
              replacement: path.resolve(
                localUiRoot,
                './marketing/PricingStrip.tsx',
              ),
            },
            {
              find: '@ui/workflow-builder',
              replacement: path.resolve(localUiRoot, './workflow-builder'),
            },
            {
              find: /^@ui\/workflow-builder\/(.*)$/,
              replacement: path.resolve(localUiRoot, './workflow-builder/$1'),
            },
          ]
        : []),
      {
        find: '@ui/primitives',
        replacement: path.resolve(__dirname, '../packages/ui/src/primitives'),
      },
      {
        find: /^@ui\/primitives\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../packages/ui/src/primitives/$1',
        ),
      },
      {
        find: /^@ui\/(.*)$/,
        replacement: `${sharedUiRoot}/$1`,
      },
      {
        find: '@ui',
        replacement: sharedUiRoot,
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, '../packages/ui/constants'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../packages/utils'),
      },
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, './app/tests/server-only.stub.ts'),
      },
      {
        find: /^@\//,
        replacement: `${appRoot}/src/`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    setupFiles: [path.resolve(appRoot, './vitest.setup.ts')],
    testTimeout: 15_000,
  },
});
