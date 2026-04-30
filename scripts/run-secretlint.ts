import { run } from 'secretlint/cli';

const result = await run();

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(result.exitStatus);
