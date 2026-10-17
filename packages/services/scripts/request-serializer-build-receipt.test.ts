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
  ])(
    'refuses to label an explicit request-cost override as the production default: %s',
    (source) => {
      expect(() =>
        createRequestSerializerBuildReceipt(Buffer.from(source), runtime),
      ).toThrow('explicit requestCost');
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
    expect(result.stderr).toContain('Only --trial 400000');
    expect(readFileSync(config)).toEqual(configSource);
    expect(existsSync(report)).toBe(false);
  });
});
