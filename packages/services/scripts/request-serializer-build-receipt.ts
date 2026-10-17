import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPinnedAppRuntime } from './request-serializer-bundle';

type PinnedAppRuntime = ReturnType<typeof readPinnedAppRuntime>;
type BuildMode = 'production-default' | 'verification-trial';

export function createRequestSerializerBuildReceipt(
  config: Uint8Array,
  runtime: PinnedAppRuntime,
  mode: BuildMode = 'production-default',
) {
  const source = Buffer.from(config).toString('utf8');
  if (mode === 'production-default' && /\brequestCost\b/.test(source))
    throw new Error(
      'Cannot label explicit requestCost as the production default',
    );
  if (
    mode === 'verification-trial' &&
    !/\brequestCost:\s*400000\b/.test(source)
  )
    throw new Error(
      'Verification trial requires the fixed requestCost: 400000',
    );
  return {
    schemaVersion: 1,
    mode,
    effectiveRequestCost: mode === 'verification-trial' ? 400000 : 200000,
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
    const patch = `config.experimental = {
  ...(config.experimental ?? {}),
  turbopackChunking: {
    ...(config.experimental?.turbopackChunking ?? {}),
    requestCost: 400000,
  },
};

`;
    const trial = Buffer.from(source.replace(needle, patch + needle));
    writeFileSync(configPath, trial);
    writeReceipt(
      out,
      createRequestSerializerBuildReceipt(trial, runtime, 'verification-trial'),
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
      'Usage: request-serializer-build-receipt.ts <report.json> [--trial 400000]',
    );
  if (process.argv.length > 3) {
    if (
      process.argv.length !== 5 ||
      process.argv[3] !== '--trial' ||
      process.argv[4] !== '400000'
    )
      throw new Error('Only --trial 400000 is supported');
    runRequestSerializerBuildTrial(
      'apps/app/next.config.ts',
      out,
      readPinnedAppRuntime(),
      () => {
        execFileSync('bun', ['run', '--cwd', 'apps/app', 'analyze'], {
          stdio: 'inherit',
        });
      },
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
