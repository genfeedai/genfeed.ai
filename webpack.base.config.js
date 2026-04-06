const path = require('node:path');
const nodeExternals = require('webpack-node-externals');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { ProgressPlugin } = require('webpack');

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
  nodeModulesDir,
}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const tsConfigPath = path.resolve(appDir, 'tsconfig.app.json');
  const workspaceRoot = path.resolve(nodeModulesDir, '..');
  const cloudPackagesRoot = path.resolve(workspaceRoot, 'packages');
  const workspaceSourceAliases = {
    '@genfeedai/config': path.resolve(cloudPackagesRoot, 'config/src'),
    '@genfeedai/integrations': path.resolve(
      cloudPackagesRoot,
      'integration-common/src',
    ),
    '@genfeedai/interfaces': path.resolve(cloudPackagesRoot, 'interfaces/src'),
    '@genfeedai/serializers': path.resolve(
      cloudPackagesRoot,
      'serializers/src',
    ),
    '@genfeedai/workflow-engine': path.resolve(
      cloudPackagesRoot,
      'workflow-engine/src',
    ),
    '@genfeedai/workflow-saas': path.resolve(
      cloudPackagesRoot,
      'workflow-saas/src',
    ),
    '@genfeedai/tools': path.resolve(cloudPackagesRoot, 'tools/src'),
    '@helpers': path.resolve(cloudPackagesRoot, 'helpers/src'),
    '@integrations': path.resolve(cloudPackagesRoot, 'integration-common/src'),
    '@serializers': path.resolve(cloudPackagesRoot, 'serializers/src'),
    '@workflow-engine': path.resolve(cloudPackagesRoot, 'workflow-engine/src'),
    '@workflow-saas': path.resolve(cloudPackagesRoot, 'workflow-saas/src'),
  };

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
      compression: 'gzip', // Compress cache to save disk space
      maxMemoryGenerations: isProduction ? 1 : 2, // Limit memory usage in dev
      name: `${appName}-${isProduction ? 'production' : 'development'}`,
      type: 'filesystem',
    },
    context: appDir,
    devtool: isProduction ? 'source-map' : false, // Disable source maps in dev for faster builds
    entry: path.resolve(appDir, 'src/main.ts'),

    externals: [
      nodeExternals({
        // Allow workspace packages to be bundled
        allowlist: [
          /^@genfeedai\//,
          /^@cloud\//,
          /^@api\//,
          /^@helpers\//,
          /^@libs\//,
          /^@serializers\//,
          /^@files\//,
          /^@workers\//,
          /^@notifications\//,
          /^@mcp\//,
          /^@discord\//,
          /^@slack\//,
          /^@telegram\//,
          /^@images\//,
          /^@videos\//,
          /^@voices\//,
          /^@clips\//,
          /^@fanvue\//,
          /^@workflow-engine\//,
          /^@workflow-saas\//,
          /^@workflow-cloud\//,
          /^@api-types\//,
          /^@cloud-types\//,
        ],
        modulesDir: nodeModulesDir,
      }),
      // Explicitly externalize NestJS optional peer dependencies and problematic modules
      {
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
      },
    ],

    // Suppress noisy OpenTelemetry/Sentry instrumentation warnings
    ignoreWarnings: [
      // OpenTelemetry dynamic requires
      { module: /@opentelemetry\/instrumentation/ },
      // require-in-the-middle dynamic requires
      { module: /require-in-the-middle/ },
      // Prisma instrumentation
      { module: /@prisma\/instrumentation/ },
    ],
    mode: isProduction ? 'production' : 'development',

    module: {
      rules: [
        // Ignore source map files from node_modules
        {
          include: /node_modules/,
          test: /\.js\.map$/,
          type: 'javascript/auto',
          use: 'null-loader',
        },
        // Handle .d.ts files - ignore them (type definitions only, no runtime code)
        {
          test: /\.d\.ts$/,
          use: 'null-loader',
        },
        // Handle .ts files (but not .d.ts)
        // Include @genfeedai/* workspace packages for direct TS transpilation (enables HMR)
        {
          exclude: [
            // Exclude node_modules EXCEPT @genfeedai/* packages
            /node_modules\/(?!@genfeedai\/)/,
            /\.d\.ts$/,
          ],
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                // Ensure decorator metadata is emitted (required for NestJS)
                emitDecoratorMetadata: true,
                experimentalDecorators: true,
              },
              configFile: tsConfigPath,
              experimentalWatchApi: true,
              transpileOnly: true, // Type checking done by turbo, not webpack
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
    },

    output: {
      clean: true,
      filename: 'main.js',
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
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
      modules: [nodeModulesDir, 'node_modules'],
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
      modules: [nodeModulesDir, 'node_modules'],
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
      aggregateTimeout: 100, // Reduced from 300ms for faster HMR
      ignored: [
        // Ignore most of node_modules but packages are resolved via alias to src/
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        // Ignore all apps except current one to prevent watching everything
        ...['api', 'mcp', 'files', 'notifications', 'workers']
          .filter((app) => app !== appName)
          .map((app) => `**/apps/server/${app}/**`),
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
