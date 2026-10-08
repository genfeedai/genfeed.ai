import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createApiObserver, OBSERVER_SYMBOL } from './api-observer-core.mjs';
import { validateRuntimeConfig } from './config.mjs';
import { cpuActivation } from './cpu-profile-core.mjs';
import {
  createSamplerWriter,
  installPassiveSamplerStop,
  startDatabaseSampler,
} from './database-sampler-core.mjs';
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
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceSha))
    throw new Error('CI observer source rejected');
  const runNonce = randomBytes(16).toString('hex'),
    control = new SharedArrayBuffer(24);
  const stream = createSamplerWriter(
    directory,
    'api-observations.ndjson',
    control,
  );
  let workerReceipt;
  const instance = createApiObserver({
    producer: 'api',
    databaseSampler: { version: 1, producer: 'api', runNonce, sourceSha },
    databaseWorker: () => workerReceipt,
    write: stream.write,
    close: stream.close,
    monitor: monitorEventLoopDelay({ resolution: 20 }),
  });
  globalThis[OBSERVER_SYMBOL] = instance.observer;
  const sampler = await startDatabaseSampler({
    version: 1,
    directory,
    sourceSha,
    runNonce,
    connectionString: Reflect.get(process.env, 'DATABASE_URL'),
    control,
  });
  installPassiveSamplerStop(() => {
    workerReceipt = sampler.stop();
    if (workerReceipt.state !== 'complete') instance.markUnavailable();
    return workerReceipt;
  });
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
