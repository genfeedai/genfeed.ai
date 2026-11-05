const fs = require('node:fs');
const path = require('node:path');
const nodeExternals = require('webpack-node-externals');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { ProgressPlugin } = require('webpack');

const GENFEED_PACKAGE_REQUEST_PATTERN = /^@genfeedai\//;
const API_TYPES_ALIAS_PATTERN = /^@api-types\//;
const CLOUD_ALIAS_PATTERN = /^@cloud\//;
const API_ALIAS_PATTERN = /^@api\//;
const HELPERS_ALIAS_PATTERN = /^@helpers\//;
const LIBS_ALIAS_PATTERN = /^@libs\//;
const SERIALIZERS_ALIAS_PATTERN = /^@serializers\//;
const FILES_ALIAS_PATTERN = /^@files\//;
const WORKERS_ALIAS_PATTERN = /^@workers\//;
const NOTIFICATIONS_ALIAS_PATTERN = /^@notifications\//;
const MCP_ALIAS_PATTERN = /^@mcp\//;
const DISCORD_ALIAS_PATTERN = /^@discord\//;
const TELEGRAM_ALIAS_PATTERN = /^@telegram\//;
const CLOUD_TYPES_ALIAS_PATTERN = /^@cloud-types\//;
const OPENTELEMETRY_INSTRUMENTATION_PATTERN = /@opentelemetry\/instrumentation/;
const REQUIRE_IN_THE_MIDDLE_PATTERN = /require-in-the-middle/;
const PRISMA_INSTRUMENTATION_PATTERN = /@prisma\/instrumentation/;
const NODE_MODULES_PATTERN = /node_modules/;
const JS_SOURCE_MAP_PATTERN = /\.js\.map$/;
const DECLARATION_FILE_PATTERN = /\.d\.ts$/;
const THIRD_PARTY_NODE_MODULES_PATTERN = /node_modules\/(?!@genfeedai\/)/;
const TS_FILE_PATTERN = /\.ts$/;

/**
 * Discover all workspace packages with a `src/` directory and produce
 * webpack aliases that resolve `@genfeedai/<name>` directly to source.
 * Avoids needing each package to ship a built `dist/` for dev bundling.
 */
function buildWorkspaceSourceAliases(cloudPackagesRoot) {
  const aliases = {};
  for (const entry of fs.readdirSync(cloudPackagesRoot, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const pkgSrc = path.resolve(cloudPackagesRoot, entry.name, 'src');
    if (!fs.existsSync(pkgSrc)) continue;
    aliases[`@genfeedai/${entry.name}`] = pkgSrc;
  }
  return aliases;
}

function buildServerSourceAliases(serverAppsRoot) {
  const aliases = {};
  for (const entry of fs.readdirSync(serverAppsRoot, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const appSrc = path.resolve(serverAppsRoot, entry.name, 'src');
    if (!fs.existsSync(appSrc)) continue;
    aliases[`@${entry.name}`] = appSrc;
  }

  const apiRoot = path.resolve(serverAppsRoot, 'api');
  aliases['@api-root'] = apiRoot;
  aliases['@api-scripts'] = path.resolve(apiRoot, 'scripts');
  aliases['@api-test'] = path.resolve(apiRoot, 'test');

  return aliases;
}

/**
 * Base webpack configuration for NestJS monorepo apps
 * @param {Object} options
 * @param {string} options.appName - Name of the app (e.g., 'api', 'mcp', 'files', 'notifications')
 * @param {string} options.appDir - Absolute path to app source directory
 * @param {string} options.distPath - Output path for dist (relative to distRoot, e.g., 'apps/api')
 * @param {string} options.distRoot - Root directory for dist output
 * @param {string} options.nodeModulesDir - Path to node_modules directory
 * @returns {Object} Webpack configuration
 */
module.exports = function createWebpackConfig({
  appName,
  appDir,
  distPath,
  distRoot,
  entryFile = 'src/main.ts',
  nodeModulesDir,
  outputFilename = 'main.js',
}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const tsConfigPath = path.resolve(appDir, 'tsconfig.app.json');
  const workspaceRoot = path.resolve(nodeModulesDir, '..');
  const bunNodeModulesDir = path.resolve(nodeModulesDir, '.bun/node_modules');
  const cloudPackagesRoot = path.resolve(workspaceRoot, 'packages');
  const serverAppsRoot = path.resolve(workspaceRoot, 'apps/server');
  const workspaceSourceAliases = {
    ...buildServerSourceAliases(serverAppsRoot),
    ...buildWorkspaceSourceAliases(cloudPackagesRoot),
    '@config': path.resolve(cloudPackagesRoot, 'config/src'),
    '@genfeedai-types': path.resolve(cloudPackagesRoot, 'types/src'),
    '@api-types': path.resolve(cloudPackagesRoot, 'api-types/src'),
    '@helpers': path.resolve(cloudPackagesRoot, 'helpers/src'),
    '@integrations': path.resolve(cloudPackagesRoot, 'integrations/src'),
    '@libs': path.resolve(cloudPackagesRoot, 'libs'),
    '@serializers': path.resolve(cloudPackagesRoot, 'serializers/src'),
  };
  const nodePtyExternal = (() => {
    try {
      return `commonjs ${require.resolve('node-pty', {
        paths: [appDir, nodeModulesDir],
      })}`;
    } catch {
      return 'commonjs node-pty';
    }
  })();
  // `recheck` (ReDoS analyzer used by @genfeedai/workflows) pulls in synckit ->
  // @pkgr/core, which reads `require.extensions`. Webpack stubs that to `(void 0)`,
  // so bundling the chain crashes at load with `Object.keys(undefined)`.
  // Resolve recheck from its owning package first and externalize the absolute
  // path so it is `require()`d at runtime, keeping the chain out of the bundle.
  const recheckExternal = (() => {
    try {
      return `commonjs ${require.resolve('recheck', {
        paths: [
          path.resolve(cloudPackagesRoot, 'workflows'),
          appDir,
          nodeModulesDir,
        ],
      })}`;
    } catch {
      return 'commonjs recheck';
    }
  })();

  return {
    // Filesystem cache for faster rebuilds (50-80% faster)
    cache: {
      buildDependencies: {
        config: [__filename, tsConfigPath],
      },
      cacheDirectory: path.resolve(
        nodeModulesDir,
        '.cache/webpack',
        `${appName}-${isProduction ? 'production' : 'development'}`,
      ),
      compression: isProduction ? 'gzip' : false, // Skip gzip in dev — write/read CPU > disk savings
      maxMemoryGenerations: isProduction ? 1 : 3, // Bound dev heap; keep last few rebuilds hot
      name: `${appName}-${isProduction ? 'production' : 'development'}`,
      type: 'filesystem',
    },
    context: appDir,
    devtool: isProduction ? 'source-map' : false, // Disable source maps in dev for faster builds
    entry: path.resolve(appDir, entryFile),

    externals: [
      nodeExternals({
        // Allow workspace packages to be bundled
        allowlist: [
          GENFEED_PACKAGE_REQUEST_PATTERN,
          API_TYPES_ALIAS_PATTERN,
          CLOUD_ALIAS_PATTERN,
          API_ALIAS_PATTERN,
          HELPERS_ALIAS_PATTERN,
          LIBS_ALIAS_PATTERN,
          SERIALIZERS_ALIAS_PATTERN,
          FILES_ALIAS_PATTERN,
          WORKERS_ALIAS_PATTERN,
          NOTIFICATIONS_ALIAS_PATTERN,
          MCP_ALIAS_PATTERN,
          DISCORD_ALIAS_PATTERN,
          TELEGRAM_ALIAS_PATTERN,
          CLOUD_TYPES_ALIAS_PATTERN,
        ],
        modulesDir: nodeModulesDir,
      }),
      // Explicitly externalize NestJS optional peer dependencies and problematic modules
      {
        // @better-auth/infra lazily imports its enterprise add-ons (SCIM
        // catalog, SAML policy via @better-auth/sso) behind runtime guards.
        // Neither package is installed here, so leave the guarded imports
        // out of the bundle instead of failing resolution at build time.
        '@better-auth/scim': 'commonjs @better-auth/scim',
        '@better-auth/sso': 'commonjs @better-auth/sso',
        '@fastify/static': 'commonjs @fastify/static',
        '@grpc/grpc-js': 'commonjs @grpc/grpc-js',
        '@grpc/proto-loader': 'commonjs @grpc/proto-loader',
        '@mikro-orm/core': 'commonjs @mikro-orm/core',
        '@nestjs/sequelize/dist/common/sequelize.utils':
          'commonjs @nestjs/sequelize/dist/common/sequelize.utils',
        '@nestjs/typeorm/dist/common/typeorm.utils':
          'commonjs @nestjs/typeorm/dist/common/typeorm.utils',
        'amqp-connection-manager': 'commonjs amqp-connection-manager',
        amqplib: 'commonjs amqplib',
        'class-transformer': 'commonjs class-transformer',
        'class-transformer/storage': 'commonjs class-transformer/storage',
        kafkajs: 'commonjs kafkajs',
        mqtt: 'commonjs mqtt',
        nats: 'commonjs nats',
        'node-pty': nodePtyExternal,
        recheck: recheckExternal,
      },
    ],

    // Suppress noisy OpenTelemetry/Sentry instrumentation warnings
    ignoreWarnings: [
      // OpenTelemetry dynamic requires
      { module: OPENTELEMETRY_INSTRUMENTATION_PATTERN },
      // require-in-the-middle dynamic requires
      { module: REQUIRE_IN_THE_MIDDLE_PATTERN },
      // Prisma instrumentation
      { module: PRISMA_INSTRUMENTATION_PATTERN },
    ],
    mode: isProduction ? 'production' : 'development',

    module: {
      rules: [
        // Ignore source map files from node_modules
        {
          include: NODE_MODULES_PATTERN,
          test: JS_SOURCE_MAP_PATTERN,
          type: 'asset/source',
        },
        // Handle .d.ts files - ignore them (type definitions only, no runtime code)
        {
          test: DECLARATION_FILE_PATTERN,
          type: 'asset/source',
        },
        // Handle .ts files (but not .d.ts)
        // Include @genfeedai/* workspace packages for direct TS transpilation (enables HMR)
        // Pass decorator options explicitly so shared Nest-bearing files outside
        // each service directory, such as packages/libs, compile the same way.
        {
          exclude: [THIRD_PARTY_NODE_MODULES_PATTERN, DECLARATION_FILE_PATTERN],
          test: TS_FILE_PATTERN,
          use: {
            loader: 'swc-loader',
            options: {
              inlineSourcesContent: true,
              jsc: {
                externalHelpers: false,
                keepClassNames: true,
                loose: false,
                parser: {
                  decorators: true,
                  dynamicImport: true,
                  syntax: 'typescript',
                  tsx: false,
                },
                target: 'es2022',
                transform: {
                  decoratorMetadata: true,
                  legacyDecorator: true,
                },
              },
              minify: false,
              module: {
                lazy: false,
                noInterop: false,
                strict: false,
                strictMode: true,
                type: 'commonjs',
              },
              sourceMaps: true,
            },
          },
        },
      ],
    },

    optimization: {
      minimize: isProduction, // Minify only in production
      // Node service bundles do not benefit from browser-style deterministic ids,
      // and named ids avoid broken numeric id rewrites in Nest's webpack output.
      moduleIds: 'named',
      nodeEnv: false, // Prevent webpack from setting process.env.NODE_ENV
      // Dev-only: skip expensive graph cleanup that adds no value in dev rebuilds
      removeAvailableModules: isProduction,
      removeEmptyChunks: isProduction,
      splitChunks: isProduction ? undefined : false,
    },

    output: {
      clean: true,
      filename: outputFilename,
      path: path.resolve(distRoot, 'dist', distPath),
    },

    plugins: [
      // Progress indicator for better DX (reduced verbosity)
      !isProduction &&
        new ProgressPlugin({
          activeModules: false,
          dependencies: false,
          dependenciesCount: 0,
          entries: true,
          modules: false,
          modulesCount: 0,
          percentBy: null,
          profile: false,
        }),

      // Type checking disabled - handled by turbo type-check separately
      // This avoids cross-package type resolution issues during bundling
    ].filter(Boolean),

    resolve: {
      // Resolve workspace packages and their internal source aliases directly
      // so production bundling can follow package-internal re-exports.
      alias: workspaceSourceAliases,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
      modules: [nodeModulesDir, bunNodeModulesDir, 'node_modules'],
      plugins: [
        new TsconfigPathsPlugin({
          configFile: tsConfigPath,
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
        }),
      ],
      // Follow symlinks to resolve workspace packages
      symlinks: true,
    },

    resolveLoader: {
      modules: [nodeModulesDir, bunNodeModulesDir, 'node_modules'],
      symlinks: true,
    },

    stats: isProduction
      ? {
          children: false,
          colors: true,
          errorDetails: true,
          modules: false,
        }
      : 'errors-warnings', // Minimal output in development
    target: 'node',

    watchOptions: {
      aggregateTimeout: 300, // Default — debounce save bursts, less rebuild thrash
      ignored: [
        // Ignore most of node_modules but packages are resolved via alias to src/
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        // Ignore all apps except current one to prevent watching everything
        ...[
          'api',
          'discord',
          'files',
          'mcp',
          'notifications',
          'slack',
          'telegram',
          'workers',
        ]
          .filter((app) => app !== appName)
          .map((app) => `**/apps/server/${app}/**`),
        // Frontend output directories
        '**/.next/**',
        // Local agent / tooling caches & artifacts (large, frequent churn)
        '**/.agents/**',
        '**/.codex/**',
        '**/.cursor/**',
        '**/.shipcode/**',
        '**/.code-review-graph/**',
        // TS incremental build info — not a real source dependency
        '**/tsconfig.tsbuildinfo',
        // Built artifacts inside packages
        '**/packages/*/dist/**',
        // Additional exclusions for better performance
        '**/logs/**',
        '**/coverage/**',
        '**/reports/**',
        '**/.turbo/**',
        '**/bun.lock',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js',
      ],
      poll: false,
    },
  };
};
