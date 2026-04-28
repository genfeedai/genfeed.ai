import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
    // Remove an entry when its spec is migrated.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/auth/controllers/auth-cli.controller.spec.ts',
      'src/collections/activities/controllers/activities.controller.spec.ts',
      'src/collections/activities/services/activities.service.spec.ts',
      'src/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service.spec.ts',
      'src/collections/agent-campaigns/services/agent-campaign-execution.service.spec.ts',
      'src/collections/agent-strategies/controllers/agent-strategies.controller.spec.ts',
      'src/collections/agent-strategies/services/agent-strategy-opportunities.service.spec.ts',
      'src/collections/bots/services/bots-livestream.service.spec.ts',
      'src/collections/brands/services/default-recurring-content.service.spec.ts',
      'src/collections/credits/services/credits.utils.service.spec.ts',
      'src/collections/elements/elements.service.spec.ts',
      'src/collections/links/controllers/links.controller.spec.ts',
      'src/collections/members/controllers/members.controller.spec.ts',
      'src/collections/members/services/members.service.spec.ts',
      'src/collections/newsletters/services/newsletters.service.spec.ts',
      'src/collections/optimizers/services/optimizers.service.spec.ts',
      'src/collections/organizations/controllers/organizations-multi-org.controller.spec.ts',
      'src/collections/organizations/controllers/organizations.controller.spec.ts',
      'src/collections/outreach-campaigns/controllers/outreach-campaigns.controller.spec.ts',
      'src/collections/posts/controllers/posts.controller.spec.ts',
      'src/collections/trends/services/trend-reference-corpus.service.spec.ts',
      'src/endpoints/analytics/business-analytics.service.spec.ts',
      'src/endpoints/analytics/schemas/analytic.schema.spec.ts',
      'src/endpoints/onboarding/onboarding.service.spec.ts',
      'src/guards/asset-access.guard.spec.ts',
      'src/helpers/utils/transaction/transaction.util.spec.ts',
      'src/queues/pattern-extraction/pattern-extraction.processor.spec.ts',
      'src/services/ad-aggregation/ad-aggregation.service.spec.ts',
      'src/services/agent-context-assembly/agent-context-assembly.service.spec.ts',
      'src/services/brand-memory/brand-memory-sync.service.spec.ts',
      'src/shared/services/polling/polling.service.spec.ts',
      'src/skills-pro/services/skill-download.service.spec.ts',
      'src/workflows/agent-workflows.service.spec.ts',
    ],
    globals: true,
    include: ['src/**/*.spec.ts'],
    name: '@genfeedai/api-unit',
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
