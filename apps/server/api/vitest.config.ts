import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

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
const isShardRun = process.argv.some(
  (arg) => arg === '--shard' || arg.startsWith('--shard='),
);
// Set by the Changed Coverage (api) job in ci.yml (#1849). That job runs the
// affected `--changed` graph only, so the full-repo thresholds below describe a
// suite it never executes — same mathematics as a shard, different mechanism.
const isChangedCodeCoverageRun = process.env.CHANGED_CODE_COVERAGE === '1';
const coverageDirectory = path.resolve(serviceDir, './coverage');

if (isCoverageRun) {
  fs.mkdirSync(path.join(coverageDirectory, '.tmp'), { recursive: true });
}

// Full-repo coverage gate. Enforced ONLY on the merged run; skipped on
// per-shard runs. Each `--shard=N/4` executes a quarter of the suite, so
// checking full-repo thresholds against a single shard is mathematically
// guaranteed to fail (~16% lines vs 50%). That failure also aborts the run
// with exit 1, which removes the `.vitest-reports/` blob before the upload
// step can grab it — starving the merge job (ENOENT). The merge job runs
// `vitest --merge-reports --coverage` (no --shard), reconstructs the full
// coverage from all 4 blobs, and re-evaluates these thresholds there.
const coverageThresholds =
  isShardRun || isChangedCodeCoverageRun
    ? undefined
    : {
        // Ratcheted ~2 points below the 2026-08-10 merged report
        // (run 31367395806: 56.54% branches, 71.48% functions, 68.04% lines,
        // 68.05% statements). Shard and changed-code runs skip this block.
        branches: 54,
        functions: 69,
        lines: 66,
        // Ratchet floor for integration code (current actual ~67.5% lines /
        // ~56% branches). Raise these toward 100 as integration test gaps fill.
        'src/{services/integrations,endpoints/integrations,marketplace-integration}/**':
          {
            branches: 55,
            functions: 65,
            lines: 65,
            statements: 65,
          },
        statements: 66,
      };

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
        replacement: path.resolve(serviceDir, './src'),
      },
      {
        find: '@api-test',
        replacement: path.resolve(serviceDir, './test'),
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types/$1',
        ),
      },
      {
        find: '@genfeedai/contracts/api-types/contracts',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types/contracts',
        ),
      },
      {
        find: '@genfeedai/contracts/api-types',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types',
        ),
      },
      {
        find: '@credits',
        replacement: path.resolve(serviceDir, './src/collections/credits'),
      },
      {
        find: '@files',
        replacement: path.resolve(serviceDir, '../files/src'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/constants',
        ),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/contracts/types',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/types',
        ),
      },
      {
        // api now imports billing DI tokens (value exports, not just types) from
        // @genfeedai/contracts/interfaces/billing. The package only ships a dist exports
        // map, so point vitest at src like every other @genfeedai/* workspace
        // alias. Subpath regex must precede the bare alias so subpaths win.
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/interfaces/$1',
        ),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/interfaces',
        ),
      },
      {
        find: '@genfeedai/actions',
        replacement: path.resolve(serviceDir, '../../../packages/actions/src'),
      },
      {
        find: /^@genfeedai\/auth-client\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/auth-client/src/$1',
        ),
      },
      {
        find: '@genfeedai/auth-client',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/auth-client/src',
        ),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(serviceDir, '../../../packages/config/src'),
      },
      {
        find: /^@genfeedai\/queue-contracts\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/queue/$1',
        ),
      },
      {
        find: '@genfeedai/contracts/queue',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/queue',
        ),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(serviceDir, '../../../packages/pricing/src'),
      },
      {
        find: '@genfeedai/storage/path-containment',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/storage/src/path-containment.ts',
        ),
      },
      {
        find: '@genfeedai/storage',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/storage/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/harness',
        replacement: path.resolve(serviceDir, '../../../packages/harness/src'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(serviceDir, '../../../packages/utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/utils/$1'),
      },
      {
        find: /^@genfeedai\/harness\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/harness/src/$1',
        ),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/config/src/$1',
        ),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src',
        ),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: '@genfeedai/workflows',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflows/src',
        ),
      },
      {
        find: /^@genfeedai\/workflows\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflows/src/$1',
        ),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(serviceDir, '../../../packages/libs'),
      },
      {
        find: '@test',
        replacement: path.resolve(serviceDir, './test'),
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
      thresholds: coverageThresholds,
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    name: '@genfeedai/api-unit',
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
