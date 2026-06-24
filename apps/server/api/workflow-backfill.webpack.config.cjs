const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'api-workflow-backfill',
  distPath: 'apps/api-workflow-backfill',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/migrations/workflow-backfill.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
