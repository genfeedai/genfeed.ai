const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'api-credential-backfill',
  distPath: 'apps/api-credential-backfill',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'scripts/backfill-credential-encryption.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
