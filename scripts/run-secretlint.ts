import { run } from 'secretlint/cli';

function stringifyStderr(stderr: unknown): string {
  if (stderr instanceof Error) {
    return stderr.stack ?? stderr.message;
  }

  return String(stderr);
}

const result = await run();

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(stringifyStderr(result.stderr));
}

const exitStatus = Number(result.exitStatus);
process.exitCode = Number.isFinite(exitStatus) ? exitStatus : 0;
