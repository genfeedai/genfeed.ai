const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'mcp',
  distPath: 'apps/mcp',
  distRoot: path.resolve(__dirname, '..'),
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
