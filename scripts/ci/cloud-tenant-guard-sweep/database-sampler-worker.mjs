import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import { POOL_OPTIONS } from './api-observer-core.mjs';
import {
  runDatabaseSampler,
  SAMPLER_SLOTS,
  validateSamplerData,
} from './database-sampler-core.mjs';

try {
  validateSamplerData(workerData);
  const require = createRequire(
    new URL('../../../apps/server/api/package.json', import.meta.url),
  );
  const { Pool } = require('pg');
  await runDatabaseSampler(
    workerData,
    new Pool({
      ...POOL_OPTIONS,
      connectionString: workerData.connectionString,
    }),
    parentPort,
  );
} catch {
  if (
    workerData?.control instanceof SharedArrayBuffer &&
    workerData.control.byteLength === 24
  ) {
    const state = new Int32Array(workerData.control);
    Atomics.store(state, SAMPLER_SLOTS.ready, 2);
    Atomics.store(state, SAMPLER_SLOTS.exit, 2);
    Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
    Atomics.notify(state, SAMPLER_SLOTS.ready);
    Atomics.notify(state, SAMPLER_SLOTS.exit);
  }
  process.exitCode = 1;
  parentPort?.close();
}
