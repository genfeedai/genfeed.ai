import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPinnedAppRuntime } from './request-serializer-bundle';

type PinnedAppRuntime = ReturnType<typeof readPinnedAppRuntime>;
type BuildMode =
  | 'production-default'
  | 'verification-trial'
  | 'verification-max-chunks-trial';
type BuildTrial = 'request-cost' | 'max-chunks';

export function createRequestSerializerBuildReceipt(
  config: Uint8Array,
  runtime: PinnedAppRuntime,
  mode: BuildMode = 'production-default',
) {
  const source = Buffer.from(config).toString('utf8');
  const requestCostOverride = /\brequestCost\b/.test(source);
  const chunkCountOverride = /\bmaxChunkCountPerGroup\b/.test(source);
  const mergeSizeOverride = /\bmaxMergeChunkSize\b/.test(source);
  if (
    mode === 'production-default' &&
    (requestCostOverride || chunkCountOverride || mergeSizeOverride)
  )
    throw new Error(
      'Cannot label explicit chunking override as the production default',
    );
  if (
    mode === 'verification-trial' &&
    (chunkCountOverride ||
      mergeSizeOverride ||
      !/\brequestCost:\s*400000\s*[,}]/.test(source))
  )
    throw new Error(
      'Verification request-cost trial requires only requestCost: 400000',
    );
  if (
    mode === 'verification-max-chunks-trial' &&
    (requestCostOverride ||
      mergeSizeOverride ||
      !/\bmaxChunkCountPerGroup:\s*1\s*[,}]/.test(source))
  )
    throw new Error(
      'Verification chunk-count trial requires only maxChunkCountPerGroup: 1',
    );
  return {
    schemaVersion: 1,
    mode,
    effectiveRequestCost: mode === 'verification-trial' ? 400000 : 200000,
    effectiveMaxChunkCountPerGroup:
      mode === 'verification-max-chunks-trial' ? 1 : 40,
    effectiveMaxMergeChunkSize: 200000,
    runtime,
    nextConfigSha256: createHash('sha256').update(config).digest('hex'),
  };
}

function writeReceipt(
  out: string,
  report: ReturnType<typeof createRequestSerializerBuildReceipt>,
) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

export function runRequestSerializerBuildTrial(
  configPath: string,
  out: string,
  runtime: PinnedAppRuntime,
  compile: () => void,
  trial: BuildTrial = 'request-cost',
): void {
  const original = readFileSync(configPath);
  let failure: { cause: unknown } | undefined;
  try {
    createRequestSerializerBuildReceipt(original, runtime);
    const source = original.toString('utf8');
    const needle = 'export default withSerwist(withNextIntl(config));';
    if (
      !source.includes(needle) ||
      source.indexOf(needle) !== source.lastIndexOf(needle)
    )
      throw new Error('Trial requires a unique final config export');
    const setting =
      trial === 'max-chunks'
        ? 'maxChunkCountPerGroup: 1'
        : 'requestCost: 400000';
    const patch = `config.experimental = {
  ...(config.experimental ?? {}),
  turbopackChunking: {
    ...(config.experimental?.turbopackChunking ?? {}),
    ${setting},
  },
};

`;
    const temporary = Buffer.from(source.replace(needle, patch + needle));
    writeFileSync(configPath, temporary);
    writeReceipt(
      out,
      createRequestSerializerBuildReceipt(
        temporary,
        runtime,
        trial === 'max-chunks'
          ? 'verification-max-chunks-trial'
          : 'verification-trial',
      ),
    );
    compile();
  } catch (cause: unknown) {
    failure = { cause };
  } finally {
    writeFileSync(configPath, original);
  }
  if (!readFileSync(configPath).equals(original))
    throw new Error('Failed to restore original config bytes');
  if (failure) throw failure.cause;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = process.argv[2];
  if (!out)
    throw new Error(
      'Usage: request-serializer-build-receipt.ts <report.json> [--trial 400000 | --trial-max-chunks 1]',
    );
  if (process.argv.length > 3) {
    let trial: BuildTrial;
    if (
      process.argv.length === 5 &&
      process.argv[3] === '--trial' &&
      process.argv[4] === '400000'
    )
      trial = 'request-cost';
    else if (
      process.argv.length === 5 &&
      process.argv[3] === '--trial-max-chunks' &&
      process.argv[4] === '1'
    )
      trial = 'max-chunks';
    else
      throw new Error(
        'Only --trial 400000 or --trial-max-chunks 1 is supported',
      );
    runRequestSerializerBuildTrial(
      'apps/app/next.config.ts',
      out,
      readPinnedAppRuntime(),
      () => {
        execFileSync('bun', ['run', '--cwd', 'apps/app', 'analyze'], {
          stdio: 'inherit',
        });
      },
      trial,
    );
  } else {
    writeReceipt(
      out,
      createRequestSerializerBuildReceipt(
        readFileSync('apps/app/next.config.ts'),
        readPinnedAppRuntime(),
      ),
    );
  }
}
