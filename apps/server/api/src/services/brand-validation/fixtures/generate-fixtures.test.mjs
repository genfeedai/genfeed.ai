import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const script = fileURLToPath(
  new URL('./generate-fixtures.mjs', import.meta.url),
);
const options = { timeout: 30_000, maxBuffer: 1024 * 1024 };
const hash = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const files = [
  'approved-text.json',
  'approved.png',
  'logo.png',
  'manifest.json',
  'product.png',
  'sample.mp4',
  'wrong-logo.png',
  'wrong-palette.png',
];
const run = (args) => exec(process.execPath, [script, ...args], options);
async function snapshot(directory) {
  const result = {};
  for (const file of await readdir(directory))
    result[file] = await readFile(join(directory, file));
  return result;
}
function pixel(data, width, x, y) {
  return [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
}

test('synthetic corpus: decoded media, literal cases, reproducibility and read-only tamper rejection', {
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'brand-validation-fixtures-'));
  try {
    const first = join(root, 'first');
    const second = join(root, 'second');
    await run(['--output-dir', first]);
    await run(['--output-dir', second]);
    assert.deepEqual((await readdir(first)).sort(), files);
    assert.deepEqual(
      await snapshot(first),
      await snapshot(second),
      'two complete generations are byte identical',
    );
    await run(['--check', '--output-dir', first]);
    const manifest = JSON.parse(
      await readFile(join(first, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.synthetic, true);
    assert.deepEqual(manifest.usage, {
      productionEvidence: false,
      providerQualification: false,
      fontCompliance: false,
    });
    assert.equal(manifest.generator.sha256, hash(await readFile(script)));
    assert.equal(manifest.artifacts.length, 7);
    assert.deepEqual(
      manifest.artifacts.map((entry) => entry.file),
      files.filter((file) => file !== 'manifest.json'),
    );
    for (const entry of manifest.artifacts) {
      const bytes = await readFile(join(first, entry.file));
      assert.equal(entry.sha256, hash(bytes));
      assert.equal(entry.byteLength, bytes.length);
      assert.ok(bytes.length > 0 && bytes.length <= 1024 * 1024);
    }
    const decoded = new Map();
    for (const file of files.filter((name) => name.endsWith('.png'))) {
      const { data, info } = await sharp(join(first, file))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const size = file === 'logo.png' || file === 'product.png' ? 32 : 256;
      assert.equal(info.width, size);
      assert.equal(info.height, size);
      assert.equal(info.channels, 4);
      decoded.set(file, data);
    }
    const logo = decoded.get('logo.png');
    const product = decoded.get('product.png');
    const approved = decoded.get('approved.png');
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const expectedLogo =
          x < 4 || x >= 28 || y < 4 || y >= 28
            ? [0, 0, 0, 255]
            : x < 16
              ? [37, 99, 235, 255]
              : [255, 255, 255, 255];
        const expectedProduct =
          x >= 8 && x <= 23 && y >= 8 && y <= 23
            ? [245, 158, 11, 255]
            : [16, 185, 129, 255];
        assert.deepEqual(pixel(logo, 32, x, y), expectedLogo);
        assert.deepEqual(pixel(product, 32, x, y), expectedProduct);
        assert.deepEqual(
          pixel(approved, 256, x + 16, y + 16),
          pixel(logo, 32, x, y),
        );
        assert.deepEqual(
          pixel(approved, 256, x + 16, y + 64),
          pixel(product, 32, x, y),
        );
      }
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        if (
          !(x >= 16 && x < 48 && ((y >= 16 && y < 48) || (y >= 64 && y < 96)))
        )
          assert.deepEqual(pixel(approved, 256, x, y), [18, 52, 86, 255]);
      }
    for (const [file, x, y, expected] of [
      ['wrong-palette.png', 200, 200, [19, 52, 86, 255]],
      ['wrong-logo.png', 20, 20, [38, 99, 235, 255]],
    ]) {
      const data = decoded.get(file);
      const differences = [];
      for (let index = 0; index < data.length; index += 4)
        if (
          !data
            .subarray(index, index + 4)
            .equals(approved.subarray(index, index + 4))
        )
          differences.push(index / 4);
      assert.deepEqual(differences, [y * 256 + x]);
      assert.deepEqual(pixel(data, 256, x, y), expected);
    }
    const probe = JSON.parse(
      (
        await exec(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            join(first, 'sample.mp4'),
          ],
          options,
        )
      ).stdout,
    );
    assert.equal(probe.streams.length, 1);
    const video = probe.streams[0];
    for (const [key, value] of Object.entries({
      codec_type: 'video',
      codec_name: 'h264',
      width: 256,
      height: 256,
      pix_fmt: 'yuv420p',
      avg_frame_rate: '24/1',
      nb_frames: '24',
    }))
      assert.equal(video[key], value);
    for (const duration of [video.duration, probe.format.duration])
      assert.ok(Number(duration) >= 0.995 && Number(duration) <= 1.005);
    const text = JSON.parse(
      await readFile(join(first, 'approved-text.json'), 'utf8'),
    );
    const baseline = 'Example Co offers a plan for USD 29 per month.';
    assert.deepEqual(Object.keys(text).sort(), [
      'brandId',
      'cases',
      'forbiddenLiteral',
      'mandatoryLiteral',
      'schemaVersion',
      'sourceId',
      'synthetic',
    ]);
    assert.equal(text.schemaVersion, 1);
    assert.equal(text.synthetic, true);
    assert.equal(text.brandId, 'fixture-brand-a');
    assert.equal(text.sourceId, 'fixture-approved-copy-v1');
    assert.equal(text.mandatoryLiteral, 'Example Co');
    assert.equal(text.forbiddenLiteral, 'Guaranteed returns');
    const expectedCases = [
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
    assert.deepEqual(
      text.cases,
      expectedCases.map(
        ([
          id,
          content,
          sourceText,
          mutation,
          expectedMandatoryPresent,
          expectedForbiddenPresent,
        ]) => ({
          id,
          text: content,
          sourceText,
          mutation,
          expectedMandatoryPresent,
          expectedForbiddenPresent,
          fullFactualCoverage: 'unverified',
        }),
      ),
    );
    for (const entry of text.cases) {
      assert.equal(
        entry.text.includes(text.mandatoryLiteral),
        entry.expectedMandatoryPresent,
      );
      assert.equal(
        entry.text.includes(text.forbiddenLiteral),
        entry.expectedForbiddenPresent,
      );
    }
    const unicode = text.cases[7];
    assert.equal(
      unicode.text.replaceAll('\r\n', '\n').normalize('NFC'),
      unicode.sourceText.normalize('NFC'),
    );
    assert.notEqual(
      hash(Buffer.from(unicode.text)),
      hash(Buffer.from(unicode.sourceText)),
    );
    for (const mutation of [
      'png-byte',
      'missing-file',
      'synthetic',
      'source-hash',
      'font-flag',
      'production-flag',
    ]) {
      const directory = join(root, mutation);
      await cp(first, directory, { recursive: true });
      if (mutation === 'png-byte') {
        const bytes = await readFile(join(directory, 'approved.png'));
        bytes[bytes.length - 1] ^= 1;
        await writeFile(join(directory, 'approved.png'), bytes);
      } else if (mutation === 'missing-file')
        await rm(join(directory, 'logo.png'));
      else {
        const changed = structuredClone(manifest);
        if (mutation === 'synthetic') changed.synthetic = false;
        else if (mutation === 'source-hash')
          changed.generator.sha256 = `sha256:${'0'.repeat(64)}`;
        else if (mutation === 'font-flag') changed.usage.fontCompliance = true;
        else changed.usage.productionEvidence = true;
        await writeFile(
          join(directory, 'manifest.json'),
          `${JSON.stringify(changed, null, 2)}\n`,
        );
      }
      const before = await snapshot(directory);
      await assert.rejects(
        run(['--check', '--output-dir', directory]),
        (error) => error.code !== 0,
      );
      assert.deepEqual(
        await snapshot(directory),
        before,
        `${mutation}: check never changes files`,
      );
    }
    for (const args of [
      ['--unknown'],
      ['--output-dir'],
      ['--check', '--check'],
      ['--output-dir', first, '--output-dir', second],
    ])
      await assert.rejects(run(args), (error) => error.code !== 0);
    process.stdout.write(
      'Verified 65,536 composition pixels, 2 one-pixel negatives, 8 text cases, 7 artifact hashes, 2 identical generations, 6 immutable tamper rejections and 4 invalid CLI rejections.\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
