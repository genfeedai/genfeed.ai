const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

const config = createWebpackConfig({
  appDir: __dirname,
  appName: 'api-articles-seed',
  distPath: 'apps/api-articles-seed',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/seeds/articles-seed.entrypoint.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});

config.resolve.alias['@api-types'] = path.resolve(
  __dirname,
  '../../../packages/contracts/src/api-types',
);

module.exports = config;
