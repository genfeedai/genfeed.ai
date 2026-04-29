import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import legacyMongooseSpecs from './test/legacy-mongoose-specs.json';

const SOURCEMAP_WARNING_FRAGMENT = 'points to missing source files';
const SOURCEMAP_WARNING_PREFIX = 'Sourcemap for';

function isSuppressedWarning(firstArg: unknown) {
  return (
    typeof firstArg === 'string' &&
    firstArg.includes(SOURCEMAP_WARNING_PREFIX) &&
    firstArg.includes(SOURCEMAP_WARNING_FRAGMENT)
  );
}

function installVitestWarningFilter() {
  const consoleWithState = console as typeof console & {
    __genfeedVitestWarningFilterInstalled__?: boolean;
  };

  if (consoleWithState.__genfeedVitestWarningFilterInstalled__) {
    return;
  }

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (isSuppressedWarning(args[0])) {
      return;
    }

    originalWarn(...args);
  };

  console.error = (...args: Parameters<typeof console.error>) => {
    if (isSuppressedWarning(args[0])) {
      return;
    }

    originalError(...args);
  };

  consoleWithState.__genfeedVitestWarningFilterInstalled__ = true;
}

function createVitestWarningLogger() {
  return {
    clearScreen() {},
    error(msg: string) {
      console.error(msg);
    },
    hasErrorLogged() {
      return false;
    },
    info(msg: string) {
      console.log(msg);
    },
    warn(msg: string) {
      if (isSuppressedWarning(msg)) {
        return;
      }

      console.warn(msg);
    },
    warnOnce(msg: string) {
      if (isSuppressedWarning(msg)) {
        return;
      }

      console.warn(msg);
    },
  };
}

installVitestWarningFilter();
const customLogger = createVitestWarningLogger();
const isCoverageRun = process.argv.includes('--coverage');
const coverageDirectory = path.resolve(__dirname, './coverage');

if (isCoverageRun) {
  fs.mkdirSync(path.join(coverageDirectory, '.tmp'), { recursive: true });
}

export default defineConfig({
  customLogger,
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          decorators: true,
          syntax: 'typescript',
        },
        target: 'es2020',
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@api',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: '@credits',
        replacement: path.resolve(__dirname, './src/collections/credits'),
      },
      {
        find: '@files',
        replacement: path.resolve(__dirname, '../files/src'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../../../packages/constants/src'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../../../packages/enums/src'),
      },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(__dirname, '../../../packages/types/src'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: '@genfeedai/harness',
        replacement: path.resolve(__dirname, '../../../packages/harness/src'),
      },
      {
        find: /^@genfeedai\/harness\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/harness/src/$1',
        ),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src',
        ),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-engine',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src/$1',
        ),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      {
        find: '@test',
        replacement: path.resolve(__dirname, './test'),
      },
    ],
  },
  test: {
    coverage: {
      // The API suite is large enough that V8 still writes temp shards late in
      // the run. Keep the reports directory intact so the pre-created .tmp
      // folder survives until coverage finalization completes.
      clean: false,
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/**/test/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/instrument.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: coverageDirectory,
      thresholds: { branches: 50, functions: 50, lines: 50, statements: 50 },
    },
    environment: 'node',
    // Tracked in #251 — rewrite to PrismaService mock pattern.
    // Remove entries from the manifest when specs are migrated.
    exclude: ['**/node_modules/**', '**/dist/**', ...legacyMongooseSpecs],
    globals: true,
    include: ['src/**/*.spec.ts'],
    name: '@genfeedai/api-unit',
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
