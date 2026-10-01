import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const source = fileURLToPath(import.meta.url);
const options = { timeout: 30_000, maxBuffer: 1024 * 1024 };
const hash = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const inventory = [
  [
    'approved-text.json',
    'application/json',
    'literal-and-claim-negative-corpus',
  ],
  ['approved.png', 'image/png', 'reference-composition'],
  ['logo.png', 'image/png', 'logo-reference'],
  ['product.png', 'image/png', 'product-reference'],
  ['sample.mp4', 'video/mp4', 'unsupported-video-coverage'],
  ['wrong-logo.png', 'image/png', 'one-pixel-logo-mutation'],
  ['wrong-palette.png', 'image/png', 'one-pixel-palette-mutation'],
];
const usage = {
  productionEvidence: false,
  providerQualification: false,
  fontCompliance: false,
};
const baseline = 'Example Co offers a plan for USD 29 per month.';
function textCorpus() {
  const rows = [
    ['literal-baseline', baseline, baseline, 'none', true, false],
    [
      'fabricated-price',
      'Example Co offers a plan for USD 99 per month.',
      baseline,
      'price',
      true,
      false,
    ],
    [
      'changed-period',
      'Example Co offers a plan for USD 29 per year.',
      baseline,
      'period',
      true,
      false,
    ],
    [
      'fabricated-testimonial',
      'A. Example said: "Example Co saved us 100 hours."',
      'A. Example said: "Example Co setup took 10 minutes."',
      'testimonial',
      true,
      false,
    ],
    [
      'fabricated-metric',
      'Example Co processed 1000 jobs in September 2026.',
      'Example Co processed 100 jobs in September 2026.',
      'metric',
      true,
      false,
    ],
    [
      'extra-prose',
      `${baseline} Guaranteed returns.`,
      baseline,
      'unsupported_extra_claim',
      true,
      true,
    ],
    [
      'missing-mandatory',
      'A plan is available.',
      baseline,
      'missing_mandatory',
      false,
      false,
    ],
    [
      'unicode-crlf',
      'Example Co\r\nCafe\u0301.',
      'Example Co\nCaf\u00e9.',
      'normalization',
      true,
      false,
    ],
  ];
  return {
    schemaVersion: 1,
    synthetic: true,
    brandId: 'fixture-brand-a',
    sourceId: 'fixture-approved-copy-v1',
    mandatoryLiteral: 'Example Co',
    forbiddenLiteral: 'Guaranteed returns',
    cases: rows.map(
      ([
        id,
        text,
        sourceText,
        mutation,
        expectedMandatoryPresent,
        expectedForbiddenPresent,
      ]) => ({
        id,
        text,
        sourceText,
        mutation,
        expectedMandatoryPresent,
        expectedForbiddenPresent,
        fullFactualCoverage: 'unverified',
      }),
    ),
  };
}
function pixels(width, height, pixel) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return data;
}
function imageCorpus() {
  const logo = pixels(32, 32, (x, y) =>
    x < 4 || x >= 28 || y < 4 || y >= 28
      ? [0, 0, 0, 255]
      : x < 16
        ? [37, 99, 235, 255]
        : [255, 255, 255, 255],
  );
  const product = pixels(32, 32, (x, y) =>
    x >= 8 && x <= 23 && y >= 8 && y <= 23
      ? [245, 158, 11, 255]
      : [16, 185, 129, 255],
  );
  const approved = pixels(256, 256, () => [18, 52, 86, 255]);
  for (const [data, top] of [
    [logo, 16],
    [product, 64],
  ])
    for (let y = 0; y < 32; y++)
      data.copy(
        approved,
        ((y + top) * 256 + 16) * 4,
        y * 32 * 4,
        (y + 1) * 32 * 4,
      );
  const palette = Buffer.from(approved);
  palette[(200 * 256 + 200) * 4] = 19;
  const wrongLogo = Buffer.from(approved);
  wrongLogo[(20 * 256 + 20) * 4] = 38;
  return new Map([
    ['approved.png', approved],
    ['logo.png', logo],
    ['product.png', product],
    ['wrong-logo.png', wrongLogo],
    ['wrong-palette.png', palette],
  ]);
}
function dimensions(file) {
  return file === 'logo.png' || file === 'product.png' ? 32 : 256;
}
async function probe(path) {
  const result = JSON.parse(
    (
      await exec(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
        options,
      )
    ).stdout,
  );
  assert.equal(result.streams.length, 1);
  const stream = result.streams[0];
  for (const [key, value] of Object.entries({
    codec_type: 'video',
    codec_name: 'h264',
    width: 256,
    height: 256,
    pix_fmt: 'yuv420p',
    avg_frame_rate: '24/1',
    nb_frames: '24',
  }))
    assert.equal(stream[key], value, key);
  for (const duration of [stream.duration, result.format.duration])
    assert.ok(
      Number(duration) >= 0.995 && Number(duration) <= 1.005,
      'video duration',
    );
}
async function artifactEntries(directory) {
  const expectedImages = imageCorpus();
  let total = 0;
  const entries = [];
  for (const [file, mediaType, purpose] of inventory) {
    const bytes = await readFile(join(directory, file));
    assert.ok(bytes.length > 0 && bytes.length <= 1024 * 1024, `${file} size`);
    total += bytes.length;
    const entry = {
      file,
      mediaType,
      sha256: hash(bytes),
      byteLength: bytes.length,
      purpose,
    };
    if (mediaType === 'image/png') {
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, dimensions(file));
      assert.equal(info.height, dimensions(file));
      assert.equal(info.channels, 4);
      assert.deepEqual(
        data,
        expectedImages.get(file),
        `${file} decoded pixels`,
      );
      entry.width = dimensions(file);
      entry.height = dimensions(file);
    } else if (mediaType === 'video/mp4') {
      await probe(join(directory, file));
      Object.assign(entry, {
        width: 256,
        height: 256,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        fps: 24,
        frames: 24,
        durationSeconds: 1,
      });
    } else {
      assert.deepEqual(JSON.parse(bytes.toString('utf8')), textCorpus());
      assert.equal(bytes.toString('utf8'), json(textCorpus()));
    }
    entries.push(entry);
  }
  assert.ok(total <= 4 * 1024 * 1024, 'corpus size');
  return entries;
}
async function generator() {
  return {
    file: 'generate-fixtures.mjs',
    sha256: hash(await readFile(source)),
    version: 1,
  };
}
async function check(directory) {
  const bytes = await readFile(join(directory, 'manifest.json'));
  assert.ok(bytes.length <= 1024 * 1024, 'manifest size');
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), [
    'artifacts',
    'corpusVersion',
    'generator',
    'schemaVersion',
    'synthetic',
    'toolchain',
    'usage',
  ]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.corpusVersion, 'brand-validation-fixtures-v1');
  assert.equal(manifest.synthetic, true);
  assert.deepEqual(manifest.usage, usage);
  assert.deepEqual(manifest.generator, await generator());
  assert.deepEqual(Object.keys(manifest.toolchain).sort(), [
    'ffmpeg',
    'ffprobe',
    'node',
    'sharp',
    'vips',
  ]);
  for (const value of Object.values(manifest.toolchain))
    assert.ok(
      typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value),
    );
  assert.deepEqual(manifest.artifacts, await artifactEntries(directory));
  assert.equal(bytes.toString('utf8'), json(manifest));
  assert.ok(
    bytes.length +
      manifest.artifacts.reduce((sum, entry) => sum + entry.byteLength, 0) <=
      4 * 1024 * 1024,
    'total size',
  );
}
async function generate(directory) {
  await mkdir(directory, { recursive: true });
  const temporary = await mkdtemp(join(directory, '.fixture-build-'));
  try {
    for (const [file, data] of imageCorpus())
      await sharp(data, {
        raw: { width: dimensions(file), height: dimensions(file), channels: 4 },
      })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: false,
          palette: false,
          progressive: false,
        })
        .toFile(join(temporary, file));
    await writeFile(join(temporary, 'approved-text.json'), json(textCorpus()));
    await exec(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x123456:s=256x256:r=24',
        '-t',
        '1',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '1',
        '-map_metadata',
        '-1',
        '-metadata',
        'creation_time=1970-01-01T00:00:00Z',
        '-fflags',
        '+bitexact',
        '-flags:v',
        '+bitexact',
        '-movflags',
        '+faststart',
        join(temporary, 'sample.mp4'),
      ],
      options,
    );
    const version = async (command) =>
      (await exec(command, ['-version'], options)).stdout.split(/\r?\n/)[0];
    const manifest = {
      schemaVersion: 1,
      corpusVersion: 'brand-validation-fixtures-v1',
      synthetic: true,
      generator: await generator(),
      toolchain: {
        node: process.version,
        sharp: sharp.versions.sharp,
        vips: sharp.versions.vips,
        ffmpeg: await version('ffmpeg'),
        ffprobe: await version('ffprobe'),
      },
      usage,
      artifacts: await artifactEntries(temporary),
    };
    await writeFile(join(temporary, 'manifest.json'), json(manifest));
    await check(temporary);
    for (const [file] of inventory)
      await rename(join(temporary, file), join(directory, file));
    await rename(
      join(temporary, 'manifest.json'),
      join(directory, 'manifest.json'),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
try {
  let directory = dirname(source);
  let checking = false;
  let outputSeen = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check' && !checking) checking = true;
    else if (
      args[index] === '--output-dir' &&
      !outputSeen &&
      args[index + 1] &&
      !args[index + 1].startsWith('--')
    ) {
      directory = resolve(args[++index]);
      outputSeen = true;
    } else throw new Error('Invalid or repeated CLI flag');
  }
  if (checking) await check(directory);
  else await generate(directory);
  process.stdout.write(
    `${checking ? 'Verified' : 'Generated'} seven synthetic artifacts and manifest.\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
