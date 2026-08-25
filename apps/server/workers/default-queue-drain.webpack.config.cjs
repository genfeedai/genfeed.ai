const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'workers-default-queue-drain',
  distPath: 'apps/workers-default-queue-drain',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/maintenance/default-queue-drain.entrypoint.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
