const { createHash } = require('node:crypto');
const {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} = require('node:fs');
const path = require('node:path');

const paths = {
  javaScript: 'packages/serializers/dist/request-runtime.bundle.js',
  sourceMap: 'packages/serializers/dist/request-runtime.bundle.js.map',
  provenance: 'packages/serializers/dist/request-runtime.provenance.json',
};
const eventPath = '.bundle-size/request-serializers-input.jsonl';
const budget = 256 * 1024;
/** @param {Buffer | string} input */
const hash = (input) => createHash('sha256').update(input).digest('hex');

/** @param {string} filename @param {number} limit */
function readBounded(filename, limit) {
  const stat = statSync(filename);
  if (!stat.isFile() || stat.size > limit)
    throw new Error('Compiler receipt read budget exceeded');
  const content = readFileSync(filename);
  if (content.length > limit)
    throw new Error('Compiler receipt read budget exceeded');
  return content;
}

/**
 * A native raw loader preserves both bytes and (without `as`) the source ident.
 * @this {{ rootContext: string, resourcePath: string, resourceQuery: string, target: string, mode: string }}
 * @param {Buffer} input
 * @returns {Buffer}
 */
function captureRequestSerializerInput(input) {
  if (!Buffer.isBuffer(input))
    throw new Error('Compiler input must be a raw Buffer');
  if (
    this.target !== 'web' ||
    this.mode !== 'production' ||
    this.resourceQuery !== ''
  )
    throw new Error('Unexpected browser compiler context');
  const appDirectory = realpathSync(this.rootContext);
  const root = path.resolve(appDirectory, '../..');
  if (appDirectory !== path.join(root, 'apps/app'))
    throw new Error('Unexpected app-project compiler context');
  const expected = path.join(root, paths.javaScript);
  if (
    this.resourcePath !== expected ||
    realpathSync(this.resourcePath) !== expected
  )
    throw new Error('Unexpected compiler resource path');
  const preflight = readBounded(
    path.join(root, '.bundle-size/request-serializers-build.json'),
    budget,
  );
  const receipt = JSON.parse(preflight.toString('utf8'));
  if (
    receipt.schemaVersion !== 1 ||
    receipt.mode !== 'production-default' ||
    !/^[a-f0-9-]{36}$/.test(receipt.input?.buildId ?? '')
  )
    throw new Error('Missing browser compiler input preflight');
  let readBytes = 0;
  for (const [key, relative] of Object.entries(paths)) {
    const artifact = receipt.input.artifacts?.[key];
    const absolute = path.join(root, relative);
    if (artifact?.path !== relative || realpathSync(absolute) !== absolute)
      throw new Error('Unexpected authenticated artifact path');
    if (
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 1 ||
      artifact.bytes > 16 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')
    )
      throw new Error('Invalid authenticated artifact');
    readBytes += statSync(absolute).size;
    if (readBytes > 16 * 1024 * 1024)
      throw new Error('Artifact read budget exceeded');
    const content = readBounded(absolute, 16 * 1024 * 1024);
    if (content.length !== artifact.bytes || hash(content) !== artifact.sha256)
      throw new Error('Changed authenticated artifact');
  }
  if (
    input.length !== receipt.input.artifacts.javaScript.bytes ||
    hash(input) !== receipt.input.artifacts.javaScript.sha256
  )
    throw new Error('Changed actual compiler input');
  const event = {
    schemaVersion: 1,
    buildId: receipt.input.buildId,
    resourcePath: paths.javaScript,
    target: this.target,
    mode: this.mode,
    inputSha256: hash(input),
    inputBytes: input.length,
    preflightSha256: hash(preflight),
  };
  const output = path.join(root, eventPath);
  if (existsSync(output)) {
    if (realpathSync(output) !== output)
      throw new Error('Unexpected receipt artifact path');
    const previous = readBounded(output, budget).toString('utf8').trim();
    const events = previous ? previous.split('\n') : [];
    if (events.length >= 128)
      throw new Error('Compiler receipt event budget exceeded');
    for (const line of events) {
      if (line !== JSON.stringify(event))
        throw new Error('Conflicting or stale compiler receipt');
    }
  }
  appendFileSync(output, `${JSON.stringify(event)}\n`);
  return input;
}
captureRequestSerializerInput.raw = true;
module.exports = captureRequestSerializerInput;
