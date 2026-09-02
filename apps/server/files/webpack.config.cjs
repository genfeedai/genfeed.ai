const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

const config = createWebpackConfig({
  appDir: __dirname,
  appName: 'files',
  distPath: 'apps/files',
  distRoot: path.resolve(__dirname, '..'),
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});

config.externals.push({
  '@remotion/bundler': 'commonjs @remotion/bundler',
  '@remotion/renderer': 'commonjs @remotion/renderer',
});

module.exports = config;
