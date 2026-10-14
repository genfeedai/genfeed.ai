const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

const config = createWebpackConfig({
  appDir: __dirname,
  appName: 'api-reference-data-sync',
  distPath: 'apps/api-reference-data-sync',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/seeds/reference-data-sync.entrypoint.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});

config.resolve.alias['@api-types'] = path.resolve(
  __dirname,
  '../../../packages/contracts/src/api-types',
);

module.exports = config;
