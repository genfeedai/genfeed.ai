import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Use the worker's existing alias configuration for the shared provider mappers.
const worker = resolve(import.meta.dir, '../../apps/server/workers');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
if (outputIndex >= 0 && args[outputIndex + 1])
  args[outputIndex + 1] = resolve(args[outputIndex + 1] as string);
const result = spawnSync(
  process.execPath,
  [
    '--tsconfig-override',
    'tsconfig.app.json',
    'src/maintenance/provider-model-import.entrypoint.ts',
    ...args,
  ],
  { cwd: worker, env: process.env, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
