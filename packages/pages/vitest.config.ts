import fs from 'node:fs';
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

// `@ui/*` is a two-entry fallback in packages/pages/tsconfig.json:
// `../ui/src/*` first, then `../ui/src/components/*`. Vite aliases take a single
// string replacement, so mirror the fallback with a resolver instead of
// hardcoding one prefix per directory — the hardcoded list silently missed
// `@ui/components/*` and every other `src/`-level directory.
const uiSrc = packageSrc('ui');
const moduleSuffixes = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
];

const resolveUiSubpath = (subpath: string): string => {
  const bases = [
    path.resolve(uiSrc, subpath),
    path.resolve(uiSrc, './components', subpath),
  ];

  for (const base of bases) {
    for (const suffix of moduleSuffixes) {
      const candidate = `${base}${suffix}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return bases[1];
};

const uiSubpathResolver = {
  enforce: 'pre' as const,
  name: 'genfeed-ui-subpath-resolver',
  resolveId(source: string) {
    const match = /^@ui\/(.+)$/.exec(source);
    if (!match) {
      return null;
    }
    return resolveUiSubpath(match[1]);
  },
};

export default defineConfig({
  plugins: [uiSubpathResolver, react()],
  resolve: {
    alias: [
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(packageSrc('api-types'), '$1'),
      },
      {
        find: /^@app-tests\/(.*)$/,
        replacement: path.resolve(appRoot, './tests/$1'),
      },
      {
        find: 'server-only',
        replacement: path.resolve(appRoot, './tests/server-only.stub.ts'),
      },
      {
        find: /^@testing-library\/react$/,
        replacement: path.resolve(
          appRoot,
          './node_modules/@testing-library/react',
        ),
      },
      {
        find: /^@testing-library\/user-event$/,
        replacement: path.resolve(
          appRoot,
          './node_modules/@testing-library/user-event',
        ),
      },
      {
        find: /^@testing-library\/jest-dom\/vitest$/,
        replacement: path.resolve(
          appRoot,
          './node_modules/@testing-library/jest-dom/dist/vitest.mjs',
        ),
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
        find: /^@genfeedai\/auth-client$/,
        replacement: path.resolve(packageSrc('auth-client'), './index.ts'),
      },
      {
        find: /^@genfeedai\/auth-client\/(.*)$/,
        replacement: path.resolve(packageSrc('auth-client'), '$1'),
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
        find: /^@genfeedai\/config$/,
        replacement: path.resolve(packageSrc('config'), 'index.ts'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(packageSrc('config'), '$1'),
      },
      {
        find: /^@genfeedai\/contracts\/constants$/,
        replacement: path.resolve(
          packageSrc('contracts'),
          'constants/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts\/constants\/(.*)$/,
        replacement: path.resolve(packageSrc('contracts'), 'constants/$1'),
      },
      {
        find: /^@genfeedai\/contracts\/interfaces$/,
        replacement: path.resolve(
          packageSrc('contracts'),
          'interfaces/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts\/interfaces\/(.*)$/,
        replacement: path.resolve(packageSrc('contracts'), 'interfaces/$1'),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(packageSrc('contracts'), 'index.ts'),
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
        find: /^@genfeedai\/pricing$/,
        replacement: path.resolve(packageSrc('pricing'), './index.ts'),
      },
      {
        find: /^@genfeedai\/pricing\/(.*)$/,
        replacement: path.resolve(packageSrc('pricing'), '$1'),
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
        find: /^@ui\/modals\/compound$/,
        replacement: path.resolve(packageSrc('ui'), './modals/compound'),
      },
      {
        find: /^@ui\/modals\/compound\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './modals/compound/$1'),
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
        find: /^@ui\/utils$/,
        replacement: path.resolve(packageSrc('ui'), './utils'),
      },
      {
        find: /^@ui\/utils\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './utils/$1'),
      },
      {
        find: /^@ui\/core$/,
        replacement: path.resolve(packageSrc('ui'), './core'),
      },
      {
        find: /^@ui\/core\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './core/$1'),
      },
      {
        find: /^@ui\/generators$/,
        replacement: path.resolve(packageSrc('ui'), './generators'),
      },
      {
        find: /^@ui\/generators\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './generators/$1'),
      },
      {
        find: /^@ui\/semantic$/,
        replacement: path.resolve(packageSrc('ui'), './semantic'),
      },
      {
        find: /^@ui\/semantic\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './semantic/$1'),
      },
      {
        find: /^@ui\/dashboard\/(.*)$/,
        replacement: path.resolve(packageSrc('ui'), './dashboard/$1'),
      },
      {
        find: /^@ui\/charts$/,
        replacement: path.resolve(packageSrc('ui'), './charts.ts'),
      },
      {
        find: /^@ui-constants$/,
        replacement: path.resolve(packageSrc('ui'), './components/constants'),
      },
      {
        find: /^@ui-constants\/(.*)$/,
        replacement: path.resolve(
          packageSrc('ui'),
          './components/constants/$1',
        ),
      },
      {
        find: /^@ui$/,
        replacement: path.resolve(packageSrc('ui'), './components'),
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
    include: ['**/*.test.ts', '**/*.test.tsx'],
    name: '@genfeedai/pages',
    setupFiles: [path.resolve(appRoot, './vitest.setup.ts')],
    testTimeout: 15_000,
  },
});
