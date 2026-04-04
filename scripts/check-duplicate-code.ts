import { spawnSync } from 'node:child_process';
import path from 'node:path';

type CliArgs = {
  advisory: boolean;
  reportDir: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  let advisory = false;
  let reportDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--advisory') {
      advisory = true;
      continue;
    }

    if (arg === '--report-dir') {
      reportDir = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { advisory, reportDir };
}

const rootDir = process.cwd();
const configPath = path.join(rootDir, '.jscpd.json');
const args = parseArgs(process.argv.slice(2));
const reporters = args.reportDir ? 'console,json' : 'console';
const commandArgs = [
  'jscpd@4',
  '.',
  '--config',
  configPath,
  '--reporters',
  reporters,
];

if (args.reportDir) {
  commandArgs.push('--output', path.resolve(rootDir, args.reportDir));
}

const result = spawnSync('npx', commandArgs, {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to run jscpd.');
  console.error(result.error.message);
  process.exit(1);
}

if (args.advisory) {
  process.exit(0);
}

process.exit(result.status ?? 1);
