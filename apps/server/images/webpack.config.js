const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'images',
  distPath: 'apps/images',
  distRoot: path.resolve(__dirname, '..'),
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
