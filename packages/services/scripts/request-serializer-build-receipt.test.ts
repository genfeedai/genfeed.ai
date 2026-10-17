import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRequestSerializerBuildReceipt,
  runRequestSerializerBuildTrial,
} from './request-serializer-build-receipt';

const runtime = {
  nextVersion: '16.4.1',
  pinnedNextVersion: '16.4.1',
  sourceSha: 'a'.repeat(40),
};

describe('serializer build provenance', () => {
  it('hashes the exact configuration bytes used for the build without retaining their contents', () => {
    const config = Buffer.from(
      'const config = { experimental: {} };\nexport default config;\n',
    );
    const receipt = createRequestSerializerBuildReceipt(config, runtime);
    expect(receipt).toEqual({
      schemaVersion: 1,
      mode: 'production-default',
      effectiveRequestCost: 200000,
      effectiveMaxChunkCountPerGroup: 40,
      effectiveMaxMergeChunkSize: 200000,
      runtime,
      nextConfigSha256: createHash('sha256').update(config).digest('hex'),
    });
    expect(JSON.stringify(receipt)).not.toContain(config.toString());
    expect(
      createRequestSerializerBuildReceipt(
        Buffer.concat([config, Buffer.from('\n')]),
        runtime,
      ).nextConfigSha256,
    ).not.toBe(receipt.nextConfigSha256);
  });

  it.each([
    'config.experimental = { turbopackChunking: { requestCost: 400000 } };',
    'config.experimental.turbopackChunking.requestCost = 400000;',
    'config.experimental = { turbopackChunking: { maxChunkCountPerGroup: 1 } };',
    'config.experimental = { turbopackChunking: { maxMergeChunkSize: 400000 } };',
  ])(
    'refuses to label explicit chunking overrides as the production default: %s',
    (source) => {
      expect(() =>
        createRequestSerializerBuildReceipt(Buffer.from(source), runtime),
      ).toThrow('explicit chunking override');
    },
  );
});

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const configSource = Buffer.from(
  'const config = { experimental: { cpus: 2, inlineCss: true } };\nexport default withSerwist(withNextIntl(config));\n',
);
function trialFixture(source = configSource) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'serializer-ci-trial-'));
  temporaryDirectories.push(directory);
  const config = path.join(directory, 'next.config.ts');
  const report = path.join(directory, 'proof/build.json');
  writeFileSync(config, source);
  return { directory, config, report };
}

describe('fixed pinned CI request-cost trial', () => {
  it('captures the actual temporary configuration before exactly one mocked compile and restores all original bytes', () => {
    const { config, report } = trialFixture();
    const compile = vi.fn(() => {
      const builtConfig = readFileSync(config);
      expect(builtConfig.toString()).toContain('requestCost: 400000');
      expect(builtConfig.toString()).toContain('cpus: 2, inlineCss: true');
      expect(JSON.parse(readFileSync(report, 'utf8'))).toEqual({
        schemaVersion: 1,
        mode: 'verification-trial',
        effectiveRequestCost: 400000,
        effectiveMaxChunkCountPerGroup: 40,
        effectiveMaxMergeChunkSize: 200000,
        runtime,
        nextConfigSha256: createHash('sha256')
          .update(builtConfig)
          .digest('hex'),
      });
    });
    runRequestSerializerBuildTrial(config, report, runtime, compile);
    expect(compile).toHaveBeenCalledOnce();
    expect(readFileSync(config)).toEqual(configSource);
  });

  it('restores original bytes after a failed compile while retaining its correctly labeled receipt', () => {
    const { config, report } = trialFixture();
    const compile = vi.fn(() => {
      throw new Error('mocked analyze failed');
    });
    expect(() =>
      runRequestSerializerBuildTrial(config, report, runtime, compile),
    ).toThrow('mocked analyze failed');
    expect(compile).toHaveBeenCalledOnce();
    expect(readFileSync(config)).toEqual(configSource);
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({
      mode: 'verification-trial',
      effectiveRequestCost: 400000,
    });
  });

  it.each([
    'export default unknownConfig;',
    'export default withSerwist(withNextIntl(config));\nexport default withSerwist(withNextIntl(config));',
  ])(
    'does not compile or mutate bytes when there is no unique supported insertion: %s',
    (source) => {
      const original = Buffer.from(source);
      const { config, report } = trialFixture(original);
      const compile = vi.fn();
      expect(() =>
        runRequestSerializerBuildTrial(config, report, runtime, compile),
      ).toThrow('unique final config export');
      expect(compile).not.toHaveBeenCalled();
      expect(readFileSync(config)).toEqual(original);
      expect(existsSync(report)).toBe(false);
    },
  );

  it.each([
    ['--trial', '400001'],
    ['--trial', '200000'],
    ['--unknown', '400000'],
    ['--trial-max-chunks', '0'],
    ['--trial-max-chunks', '2'],
    ['--trial-max-chunks'],
    ['--trial', '400000', '--trial-max-chunks', '1'],
    ['--trial-max-chunks', '1', '--trial', '400000'],
  ])('rejects every other CLI trial before compiling: %s %s', (...flags) => {
    const { directory, config, report } = trialFixture();
    const result = spawnSync(
      'bun',
      [
        fileURLToPath(
          new URL('./request-serializer-build-receipt.ts', import.meta.url),
        ),
        report,
        ...flags,
      ],
      { cwd: directory, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Only --trial 400000 or --trial-max-chunks 1 is supported',
    );
    expect(readFileSync(config)).toEqual(configSource);
    expect(existsSync(report)).toBe(false);
  });
});

describe('fixed pinned CI chunk-count trial', () => {
  it.each([false, true])(
    'records only count=1 with default costs before one mocked compile and restores bytes (compile fails: %s)',
    (failCompile) => {
      const { config, report } = trialFixture();
      const compile = vi.fn(() => {
        const builtConfig = readFileSync(config);
        expect(builtConfig.toString()).toContain('maxChunkCountPerGroup: 1');
        expect(builtConfig.toString()).not.toContain('requestCost:');
        expect(builtConfig.toString()).not.toContain('maxMergeChunkSize:');
        expect(builtConfig.toString()).toContain('cpus: 2, inlineCss: true');
        expect(JSON.parse(readFileSync(report, 'utf8'))).toEqual({
          schemaVersion: 1,
          mode: 'verification-max-chunks-trial',
          effectiveRequestCost: 200000,
          effectiveMaxChunkCountPerGroup: 1,
          effectiveMaxMergeChunkSize: 200000,
          runtime,
          nextConfigSha256: createHash('sha256')
            .update(builtConfig)
            .digest('hex'),
        });
        if (failCompile) throw new Error('mocked count trial failed');
      });
      const run = () =>
        runRequestSerializerBuildTrial(
          config,
          report,
          runtime,
          compile,
          'max-chunks',
        );
      if (failCompile) expect(run).toThrow('mocked count trial failed');
      else run();
      expect(compile).toHaveBeenCalledOnce();
      expect(readFileSync(config)).toEqual(configSource);
    },
  );

  it.each([
    'requestCost: 400000',
    'maxChunkCountPerGroup: 2',
    'maxMergeChunkSize: 400000',
  ])(
    'rejects existing tuning instead of combining the count trial with %s',
    (override) => {
      const original = Buffer.from(
        configSource
          .toString()
          .replace(
            'inlineCss: true',
            `inlineCss: true, turbopackChunking: { ${override} }`,
          ),
      );
      const { config, report } = trialFixture(original);
      const compile = vi.fn();
      expect(() =>
        runRequestSerializerBuildTrial(
          config,
          report,
          runtime,
          compile,
          'max-chunks',
        ),
      ).toThrow('explicit chunking override');
      expect(compile).not.toHaveBeenCalled();
      expect(readFileSync(config)).toEqual(original);
      expect(existsSync(report)).toBe(false);
    },
  );

  it('rejects an unsupported insertion without a compile or a receipt', () => {
    const original = Buffer.from('export default unknownConfig;');
    const { config, report } = trialFixture(original);
    const compile = vi.fn();
    expect(() =>
      runRequestSerializerBuildTrial(
        config,
        report,
        runtime,
        compile,
        'max-chunks',
      ),
    ).toThrow('unique final config export');
    expect(compile).not.toHaveBeenCalled();
    expect(readFileSync(config)).toEqual(original);
    expect(existsSync(report)).toBe(false);
  });
});
