import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../..');
const pagesRoot = path.resolve(__dirname);
const appRoot = path.resolve(repoRoot, './apps/app');

const packageRoot = (name: string) =>
  path.resolve(repoRoot, `./packages/${name}`);
const packageSrc = (name: string) =>
  path.resolve(repoRoot, `./packages/${name}/src`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'server-only',
        replacement: path.resolve(appRoot, './tests/server-only.stub.ts'),
      },
      {
        find: /^@pages$/,
        replacement: pagesRoot,
      },
      {
        find: /^@pages\/(.*)$/,
        replacement: path.resolve(pagesRoot, '$1'),
      },
      {
        find: /^@genfeedai\/pages$/,
        replacement: path.resolve(pagesRoot, './index.ts'),
      },
      {
        find: /^@genfeedai\/pages\/(.*)$/,
        replacement: path.resolve(pagesRoot, '$1'),
      },
      {
        find: /^@genfeedai\/agent$/,
        replacement: path.resolve(packageSrc('agent'), './index.ts'),
      },
      {
        find: /^@genfeedai\/agent\/(.*)$/,
        replacement: path.resolve(packageSrc('agent'), '$1'),
      },
      {
        find: /^@genfeedai\/client$/,
        replacement: packageSrc('client'),
      },
      {
        find: /^@genfeedai\/client\/(.*)$/,
        replacement: path.resolve(packageSrc('client'), '$1'),
      },
      {
        find: /^@genfeedai\/constants$/,
        replacement: packageSrc('constants'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(packageSrc('constants'), '$1'),
      },
      {
        find: /^@genfeedai\/contexts$/,
        replacement: packageRoot('contexts'),
      },
      {
        find: /^@genfeedai\/contexts\/(.*)$/,
        replacement: path.resolve(packageRoot('contexts'), '$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: packageSrc('enums'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(packageSrc('enums'), '$1'),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: packageSrc('helpers'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(packageSrc('helpers'), '$1'),
      },
      {
        find: /^@genfeedai\/hooks$/,
        replacement: packageRoot('hooks'),
      },
      {
        find: /^@genfeedai\/hooks\/(.*)$/,
        replacement: path.resolve(packageRoot('hooks'), '$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: packageSrc('interfaces'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(packageSrc('interfaces'), '$1'),
      },
      {
        find: /^@genfeedai\/models$/,
        replacement: packageRoot('models'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: path.resolve(packageRoot('models'), '$1'),
      },
      {
        find: /^@genfeedai\/props$/,
        replacement: packageRoot('props'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(packageRoot('props'), '$1'),
      },
      {
        find: /^@genfeedai\/providers$/,
        replacement: packageRoot('providers'),
      },
      {
        find: /^@genfeedai\/providers\/(.*)$/,
        replacement: path.resolve(packageRoot('providers'), '$1'),
      },
      {
        find: /^@genfeedai\/serializers$/,
        replacement: packageSrc('serializers'),
      },
      {
        find: /^@genfeedai\/serializers\/(.*)$/,
        replacement: path.resolve(packageSrc('serializers'), '$1'),
      },
      {
        find: /^@genfeedai\/services$/,
        replacement: packageRoot('services'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(packageRoot('services'), '$1'),
      },
      {
        find: /^@genfeedai\/types$/,
        replacement: packageSrc('types'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(packageSrc('types'), '$1'),
      },
      {
        find: /^@genfeedai\/ui$/,
        replacement: path.resolve(packageSrc('ui'), './index.ts'),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), '$1'),
      },
      {
        find: /^@genfeedai\/utils$/,
        replacement: packageRoot('utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(packageRoot('utils'), '$1'),
      },
      {
        find: /^@contexts$/,
        replacement: packageRoot('contexts'),
      },
      {
        find: /^@contexts\/(.*)$/,
        replacement: path.resolve(packageRoot('contexts'), '$1'),
      },
      {
        find: /^@helpers$/,
        replacement: packageSrc('helpers'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(packageSrc('helpers'), '$1'),
      },
      {
        find: /^@hooks$/,
        replacement: packageRoot('hooks'),
      },
      {
        find: /^@hooks\/(.*)$/,
        replacement: path.resolve(packageRoot('hooks'), '$1'),
      },
      {
        find: /^@models$/,
        replacement: packageRoot('models'),
      },
      {
        find: /^@models\/(.*)$/,
        replacement: path.resolve(packageRoot('models'), '$1'),
      },
      {
        find: /^@props$/,
        replacement: packageRoot('props'),
      },
      {
        find: /^@props\/(.*)$/,
        replacement: path.resolve(packageRoot('props'), '$1'),
      },
      {
        find: /^@providers$/,
        replacement: path.resolve(packageRoot('contexts'), './providers'),
      },
      {
        find: /^@providers\/(.*)$/,
        replacement: path.resolve(packageRoot('contexts'), './providers/$1'),
      },
      {
        find: /^@serializers$/,
        replacement: packageSrc('serializers'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(packageSrc('serializers'), '$1'),
      },
      {
        find: /^@services$/,
        replacement: packageRoot('services'),
      },
      {
        find: /^@services\/(.*)$/,
        replacement: path.resolve(packageRoot('services'), '$1'),
      },
      {
        find: /^@ui\/primitives$/,
        replacement: path.resolve(packageSrc('ui'), './primitives'),
      },
      {
        find: /^@ui\/primitives\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './primitives/$1'),
      },
      {
        find: /^@ui$/,
        replacement: path.resolve(packageSrc('ui'), './components'),
      },
      {
        find: /^@ui\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './components/$1'),
      },
      {
        find: /^@utils$/,
        replacement: packageRoot('utils'),
      },
      {
        find: /^@utils\/(.*)$/,
        replacement: path.resolve(packageRoot('utils'), '$1'),
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
    include: ['studio/generate/utils/**/*.test.ts'],
    name: '@genfeedai/pages',
    setupFiles: [path.resolve(appRoot, './vitest.setup.ts')],
    testTimeout: 15_000,
  },
});
