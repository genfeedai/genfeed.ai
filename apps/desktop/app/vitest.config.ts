import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const packagePath = (packageName: string, subpath = '') =>
  path.resolve(repoRoot, 'packages', packageName, subpath);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@configs',
        replacement: path.resolve(repoRoot, 'configs'),
      },
      {
        find: '@contexts',
        replacement: packagePath('contexts'),
      },
      {
        find: '@helpers',
        replacement: packagePath('helpers', 'src'),
      },
      {
        find: '@hooks',
        replacement: packagePath('hooks'),
      },
      {
        find: '@models',
        replacement: packagePath('models'),
      },
      {
        find: '@props',
        replacement: packagePath('props'),
      },
      {
        find: '@providers',
        replacement: packagePath('providers'),
      },
      {
        find: '@renderer',
        replacement: path.resolve(__dirname, 'src/renderer'),
      },
      {
        find: '@serializers',
        replacement: packagePath('serializers', 'src'),
      },
      {
        find: '@services',
        replacement: packagePath('services'),
      },
      {
        find: '@styles',
        replacement: packagePath('styles'),
      },
      {
        find: '@ui-constants',
        replacement: packagePath('ui', 'src/components/constants'),
      },
      {
        find: /^@ui\/primitives\/(.*)$/,
        replacement: packagePath('ui', 'src/primitives/$1'),
      },
      {
        find: '@ui',
        replacement: packagePath('ui', 'src/components'),
      },
      {
        find: '@utils',
        replacement: packagePath('utils'),
      },
      {
        find: '@genfeedai/enums',
        replacement: packagePath('enums', 'src/index.ts'),
      },
      {
        find: /^@genfeedai\/agent\/(.*)$/,
        replacement: packagePath('agent', 'src/$1'),
      },
      {
        find: /^@genfeedai\/contexts\/(.*)$/,
        replacement: packagePath('contexts', '$1'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: packagePath('helpers', 'src/$1'),
      },
      {
        find: /^@genfeedai\/hooks\/(.*)$/,
        replacement: packagePath('hooks', '$1'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: packagePath('models', '$1'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: packagePath('props', '$1'),
      },
      {
        find: /^@genfeedai\/serializers\/(.*)$/,
        replacement: packagePath('serializers', 'src/$1'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: packagePath('services', '$1'),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: packagePath('ui', 'src/$1'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: packagePath('utils', '$1'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    globals: true,
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/renderer/test/setup.ts'],
    testTimeout: 15_000,
  },
});
