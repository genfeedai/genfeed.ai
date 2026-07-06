const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

const config = createWebpackConfig({
  appDir: __dirname,
  appName: 'api-workflow-backfill',
  distPath: 'apps/api-workflow-backfill',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/migrations/workflow-backfill.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});

config.resolve.alias['@api-types'] = path.resolve(
  __dirname,
  '../../../packages/api-types/src',
);

module.exports = config;
