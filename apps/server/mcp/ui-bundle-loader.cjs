module.exports = function () {
  const callback = this.async();
  const builder = require.resolve('./ui-bundle.cjs');
  this.addDependency(builder);
  delete require.cache[builder];
  const { buildMcpPreview } = require(builder);
  buildMcpPreview(
    (file) => this.addDependency(file),
    (directory) => this.addContextDependency(directory),
  ).then(
    (preview) => callback(null, `module.exports = ${JSON.stringify(preview)};`),
    (error) => callback(error),
  );
};
