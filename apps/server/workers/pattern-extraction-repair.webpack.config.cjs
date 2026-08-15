const path = require('node:path');
const createWebpackConfig = require('../../../webpack.base.config');

module.exports = createWebpackConfig({
  appDir: __dirname,
  appName: 'workers-pattern-extraction-repair',
  distPath: 'apps/workers-pattern-extraction-repair',
  distRoot: path.resolve(__dirname, '..'),
  entryFile: 'src/maintenance/pattern-extraction-queue-repair.entrypoint.ts',
  nodeModulesDir: path.resolve(__dirname, '../../../node_modules'),
});
