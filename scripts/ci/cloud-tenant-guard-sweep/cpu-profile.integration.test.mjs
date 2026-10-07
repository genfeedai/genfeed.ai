import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateCpuProfile } from './cpu-profile-core.mjs';

test('actual worker inspector seals main-isolate CPU while deterministic main code remains busy', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cpu-main-proof-'));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const core = new URL('./cpu-profile-core.mjs', import.meta.url).href;
  const childFile = join(directory, 'busy-child.mjs');
  const importFile = join(directory, 'inherited-import.mjs');
  const importCount = join(directory, 'import-count');
  writeFileSync(
    importFile,
    `import {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(importCount)}, 'x', {mode:0o600});`,
    { mode: 0o600 },
  );
  const workerCode = `const { parentPort, workerData }=require('node:worker_threads'); (async()=>{const {Session}=require('node:inspector');const {captureCpuProfile,CPU_LIMITS}=await import(${JSON.stringify(core)});const flags=new Int32Array(workerData.flags);await captureCpuProfile({directory:workerData.directory,session:new Session(),limits:{...CPU_LIMITS,captureMs:100,watchdogMs:2000,triggerMs:2000,pollMs:1},onStarted:()=>{Atomics.store(flags,0,1);parentPort.postMessage({started:true,isolatedEnv:process.env.CPU_PRIVATE_SENTINEL===undefined,isolatedImports:process.execArgv.length===0});},onSealed:seal=>{Atomics.store(flags,0,seal.state==='complete'?2:3);parentPort.postMessage({state:seal.state});}});})().catch(()=>process.exitCode=1);`;
  writeFileSync(
    childFile,
    `import {Worker} from 'node:worker_threads';import {performance} from 'node:perf_hooks';import {writeCpuTrigger} from ${JSON.stringify(core)};const flags=new SharedArrayBuffer(4),state=new Int32Array(flags);let delayedTimerRan=false;const worker=new Worker(${JSON.stringify(workerCode)},{eval:true,execArgv:[],env:{},workerData:{directory:${JSON.stringify(directory)},flags}});writeCpuTrigger(${JSON.stringify(directory)});function staticBusyMainProof(){const end=performance.now()+1000;let value=0,sealedWhileBusy=false;while(performance.now()<end){value=(value+Math.sqrt(value+123.4))%100000;if(Atomics.load(state,0)===2)sealedWhileBusy=true;}return {sealedWhileBusy,value};}worker.once('message',message=>{setTimeout(()=>{delayedTimerRan=true;},0);const result=staticBusyMainProof();process.send({started:message.started===true,isolatedEnv:message.isolatedEnv,isolatedImports:message.isolatedImports,sealedWhileBusy:result.sealedWhileBusy,delayedTimerRan});});worker.once('exit',()=>process.disconnect());`,
    { mode: 0o600 },
  );
  const child = fork(childFile, [], {
    execArgv: ['--import', pathToFileURL(importFile).href],
    env: { CPU_PRIVATE_SENTINEL: 'PRIVATE_PARENT_SENTINEL' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let watchdog;
  t.after(() => {
    clearTimeout(watchdog);
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  const result = await new Promise((resolve, reject) => {
    watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Busy-main inspector proof exceeded child watchdog'));
    }, 5000);
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error('Busy-main inspector child failed'));
    });
  });
  assert.equal(result.started, true);
  assert.equal(result.isolatedEnv, true);
  assert.equal(result.isolatedImports, true);
  assert.equal(readFileSync(importCount, 'utf8'), 'x');
  assert.equal(result.sealedWhileBusy, true);
  assert.equal(result.delayedTimerRan, false);
  const raw = JSON.parse(
    readFileSync(join(directory, 'cpu-profile.raw.json'), 'utf8'),
  );
  validateCpuProfile(raw);
  const ids = new Set(
    raw.nodes
      .filter(
        (node) =>
          node.callFrame.functionName === 'staticBusyMainProof' &&
          [
            pathToFileURL(realpathSync(childFile)).href,
            realpathSync(childFile),
          ].includes(node.callFrame.url) &&
          node.callFrame.lineNumber >= 0,
      )
      .map((node) => node.id),
  );
  assert.ok(ids.size > 0);
  assert.ok(
    raw.samples.some((id) => ids.has(id)),
    'main-isolate static busy function must be sampled',
  );
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  clearTimeout(watchdog);
});
