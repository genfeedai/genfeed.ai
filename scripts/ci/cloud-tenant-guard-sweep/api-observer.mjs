import { closeSync, constants, openSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  createApiObserver,
  OBSERVER_SYMBOL,
  POOL_OPTIONS,
} from './api-observer-core.mjs';
import { validateRuntimeConfig } from './config.mjs';
import { cpuActivation } from './cpu-profile-core.mjs';
import { validateRunDirectory } from './local-mail-stub.mjs';

if (
  Reflect.get(process.env, 'CLOUD_SWEEP_CPU_PROFILE') === '1' &&
  Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS') !== '1'
)
  cpuActivation(process.env);

if (Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS') === '1') {
  const runtime = validateRuntimeConfig(process.env);
  if (
    runtime.mode !== 'ci' ||
    Reflect.get(process.env, 'GITHUB_ACTIONS') !== 'true'
  )
    throw new Error('CI observer activation rejected');
  const directory = validateRunDirectory(
    Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'),
  );
  const descriptor = openSync(
    join(directory, 'api-observations.ndjson'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  const require = createRequire(
    new URL('../../../apps/server/api/package.json', import.meta.url),
  );
  const { Pool } = require('pg');
  const pool = new Pool({
    ...POOL_OPTIONS,
    connectionString: Reflect.get(process.env, 'DATABASE_URL'),
  });
  const instance = createApiObserver({
    write: (line) => {
      const buffer = Buffer.from(line);
      if (writeSync(descriptor, buffer) !== buffer.length)
        throw new Error('Observer write incomplete');
    },
    close: () => closeSync(descriptor),
    pool,
    monitor: monitorEventLoopDelay({ resolution: 20 }),
  });
  globalThis[OBSERVER_SYMBOL] = instance.observer;
  process.once('exit', instance.stop);
  if (cpuActivation(process.env, true)) {
    const worker = new Worker(
      new URL('./cpu-profile-worker.mjs', import.meta.url),
      {
        execArgv: [],
        env: {},
        workerData: {
          version: 1,
          directory,
          repositoryRoot: fileURLToPath(
            new URL('../../../', import.meta.url),
          ).replace(/\/$/, ''),
        },
      },
    );
    worker.on('error', () => {
      /* Missing seal is retained by the collector. */
    });
    worker.on('exit', () => {
      /* Never control or replace API shutdown. */
    });
    worker.unref();
  }
}
