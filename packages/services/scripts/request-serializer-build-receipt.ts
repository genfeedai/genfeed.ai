import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPinnedAppRuntime } from './request-serializer-bundle';

type PinnedAppRuntime = ReturnType<typeof readPinnedAppRuntime>;

export function createRequestSerializerBuildReceipt(
  config: Uint8Array,
  runtime: PinnedAppRuntime,
) {
  if (/\brequestCost\b/.test(Buffer.from(config).toString('utf8')))
    throw new Error(
      'Cannot label explicit requestCost as the production default',
    );
  return {
    schemaVersion: 1,
    mode: 'production-default',
    effectiveRequestCost: 200000,
    runtime,
    nextConfigSha256: createHash('sha256').update(config).digest('hex'),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = process.argv[2];
  if (!out)
    throw new Error('Usage: request-serializer-build-receipt.ts <report.json>');
  const report = createRequestSerializerBuildReceipt(
    readFileSync('apps/app/next.config.ts'),
    readPinnedAppRuntime(),
  );
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
