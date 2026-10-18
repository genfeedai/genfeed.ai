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
  const source = Buffer.from(config).toString('utf8');
  if (
    /\b(?:requestCost|maxChunkCountPerGroup|maxMergeChunkSize)\b/.test(source)
  )
    throw new Error(
      'Cannot label explicit chunking override as the production default',
    );
  return {
    schemaVersion: 1,
    mode: 'production-default',
    effectiveRequestCost: 200000,
    effectiveMaxChunkCountPerGroup: 40,
    effectiveMaxMergeChunkSize: 200000,
    runtime,
    nextConfigSha256: createHash('sha256').update(config).digest('hex'),
  };
}

export function writeRequestSerializerBuildReceipt(
  configPath: string,
  out: string,
  runtime: PinnedAppRuntime,
): void {
  const report = createRequestSerializerBuildReceipt(
    readFileSync(configPath),
    runtime,
  );
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = process.argv[2];
  if (!out || process.argv.length !== 3)
    throw new Error(
      'Usage: request-serializer-build-receipt.ts <report.json>; chunking trials are not supported',
    );
  writeRequestSerializerBuildReceipt(
    'apps/app/next.config.ts',
    out,
    readPinnedAppRuntime(),
  );
}
