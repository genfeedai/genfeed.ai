import { Session } from 'node:inspector';
import { isMainThread, workerData } from 'node:worker_threads';
import { captureCpuProfile, validateWorkerData } from './cpu-profile-core.mjs';

if (isMainThread) throw new Error('CPU diagnostic worker entry rejected');
const { directory } = validateWorkerData(workerData);
await captureCpuProfile({ directory, session: new Session() });
