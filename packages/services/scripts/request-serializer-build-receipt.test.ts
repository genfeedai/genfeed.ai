import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRequestSerializerBuildReceipt } from './request-serializer-build-receipt';

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
