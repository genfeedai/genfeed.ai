import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

function stringifyStderr(stderr: unknown): string {
  if (stderr instanceof Error) {
    return stderr.stack ?? stderr.message;
  }

  return String(stderr);
}

function isBunTextlintInteropError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    error.message.includes('debug') &&
    error.message.includes('is not a function')
  );
}

function resolveSecretlintBin(): string | null {
  const require = createRequire(import.meta.url);

  try {
    const packageJsonPath = require.resolve('secretlint/package.json');
    const binPath = path.join(
      path.dirname(packageJsonPath),
      'bin',
      'secretlint.js',
    );

    return existsSync(binPath) ? binPath : null;
  } catch {
    return null;
  }
}

function runSecretlintCliWithNode(): void {
  const binPath = resolveSecretlintBin();
  if (!binPath) {
    throw new Error('Unable to resolve secretlint CLI binary');
  }

  const result = spawnSync('node', [binPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

async function runSecretlintApi(): Promise<void> {
  const { run } = await import('secretlint/cli');
  const result = await run();

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(stringifyStderr(result.stderr));
  }

  const exitStatus = Number(result.exitStatus);
  process.exitCode = Number.isFinite(exitStatus) ? exitStatus : 0;
}

try {
  await runSecretlintApi();
} catch (error) {
  if (!isBunTextlintInteropError(error)) {
    throw error;
  }

  runSecretlintCliWithNode();
}
