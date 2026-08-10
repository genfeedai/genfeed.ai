import fs, { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Guard: `@billing-providers` must resolve to the billing DI fragment that
 * matches the build flavor on disk.
 *
 * The failure mode this pins down (#2751): apps/server/api/tsconfig.json maps
 * `@billing-providers` to the OSS fragment so tsc has a static target, and
 * TsconfigPathsPlugin taps the same enhanced-resolve hook as `resolve.alias` —
 * and wins. Every server image built that way bundled the OSS no-op billing
 * stub, EE fragment present or not, which 403'd all SaaS org billing in
 * production while unit tests (which mock the fragment) stayed green.
 *
 * webpack.base.config.js now registers a flavor resolver plugin ahead of
 * TsconfigPathsPlugin. This check exercises the REAL resolve options through
 * enhanced-resolve, so it fails if the plugin is removed, reordered after
 * TsconfigPathsPlugin, or drifts from the ee-presence probe.
 *
 * The OSS side needs no equivalent check: with `ee/packages/billing/src`
 * absent, the tsconfig mapping and the flavor plugin agree on the OSS file.
 */

const repoRoot = path.resolve(import.meta.dir, '..');
const require = createRequire(path.join(repoRoot, 'package.json'));

const eeBillingSrc = path.join(repoRoot, 'ee/packages/billing/src');
const hasEE = existsSync(eeBillingSrc);
const expectedFile = hasEE
  ? path.join(eeBillingSrc, 'billing.providers.ee.ts')
  : path.join(
      repoRoot,
      'apps/server/api/src/common/subscriptions/billing.providers.oss.ts',
    );

interface WebpackConfigWithResolve {
  resolve: Record<string, unknown>;
}

interface EnhancedResolveModule {
  CachedInputFileSystem: new (inputFs: typeof fs, duration: number) => unknown;
  ResolverFactory: {
    createResolver(options: Record<string, unknown>): {
      resolveSync(
        context: Record<string, unknown>,
        basePath: string,
        request: string,
      ): string | false;
    };
  };
}

const apiWebpackConfig = require(
  path.join(repoRoot, 'apps/server/api/webpack.config.cjs'),
) as WebpackConfigWithResolve;

// enhanced-resolve is webpack's own resolver — resolve it through webpack so
// the check uses the exact implementation the build uses.
const webpackRequire = createRequire(
  require.resolve('webpack/package.json', {
    paths: [path.join(repoRoot, 'apps/server/api')],
  }),
);
const enhancedResolve = webpackRequire(
  'enhanced-resolve',
) as EnhancedResolveModule;

const resolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  ...apiWebpackConfig.resolve,
});

const importer = path.join(
  repoRoot,
  'apps/server/api/src/collections/subscriptions',
);
const resolved = resolver.resolveSync({}, importer, '@billing-providers');

if (resolved !== expectedFile) {
  console.error(
    `check:billing-flavor FAILED\n` +
      `  ee/packages/billing/src present: ${hasEE}\n` +
      `  expected @billing-providers -> ${expectedFile}\n` +
      `  actually resolved to         -> ${String(resolved)}\n` +
      `The billing flavor resolver in webpack.base.config.js must stay FIRST\n` +
      `in resolve.plugins — TsconfigPathsPlugin maps @billing-providers to the\n` +
      `OSS stub and wins over resolve.alias if it runs first (#2751).`,
  );
  process.exit(1);
}

console.log(
  `check:billing-flavor OK — @billing-providers -> ${
    hasEE ? 'ee' : 'oss'
  } fragment (${path.relative(repoRoot, resolved)})`,
);
