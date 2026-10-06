const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

const config = createWebpackConfig({
  appDir: __dirname,
  appName: 'mcp',
  distPath: 'apps/mcp',
  distRoot: path.resolve(__dirname, '..'),
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});

// A managed checkout lives below ~/.codex/worktrees; only ignore this repo's
// agent cache, otherwise webpack misses every source edit in that checkout.
config.watchOptions.ignored = config.watchOptions.ignored.map((pattern) =>
  pattern === '**/.codex/**'
    ? path.resolve(__dirname, '../../../.codex/**')
    : pattern,
);
config.cache.buildDependencies.config.push(
  __filename,
  path.join(__dirname, 'ui-bundle.cjs'),
  path.join(__dirname, 'ui-bundle-loader.cjs'),
);

config.module.rules.push({
  test: /preview-client\.tsx$/,
  resourceQuery: /mcp-preview/,
  use: path.join(__dirname, 'ui-bundle-loader.cjs'),
});
module.exports = config;
