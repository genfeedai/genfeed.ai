const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'workers-fal-model-sync',
  distPath: 'apps/workers-fal-model-sync',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/maintenance/fal-model-sync.entrypoint.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
