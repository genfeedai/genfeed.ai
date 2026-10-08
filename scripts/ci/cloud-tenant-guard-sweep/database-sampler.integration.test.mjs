import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { createApiObserver } from './api-observer-core.mjs';
import {
  createSamplerController,
  createSamplerWriter,
  readIsolatedSampler,
} from './database-sampler-core.mjs';
import { writeDiagnosticEvidence } from './diagnostic-output.mjs';
import { zeroMailStats } from './local-mail-stub.mjs';

const core = new URL('./database-sampler-core.mjs', import.meta.url).href;
const observerCore = new URL('./api-observer-core.mjs', import.meta.url).href;
function owned(t) {
  const d = mkdtempSync(join(tmpdir(), 'sampler-native-'));
  chmodSync(d, 0o700);
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
const workerSource = `
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {EventEmitter} from 'node:events';import {parentPort,workerData} from 'node:worker_threads';
import {runDatabaseSampler} from ${JSON.stringify(core)};import {POOL_OPTIONS,DATABASE_QUERY} from ${JSON.stringify(observerCore)};
const {data,scenario,marker}=workerData;let calls=0;
const pool=Object.assign(new EventEmitter(),{idleCount:0,totalCount:0,end:async()=>{if(scenario==='hang-end')await new Promise(()=>{});if(scenario==='fsync-error'||scenario==='close-error'){fs[scenario==='fsync-error'?'fsyncSync':'closeSync']=()=>{throw Error('private-path-error');};syncBuiltinESMExports();}},query:query=>{
 if(query!==DATABASE_QUERY||POOL_OPTIONS.min!==1||POOL_OPTIONS.max!==1||POOL_OPTIONS.query_timeout!==750||POOL_OPTIONS.statement_timeout!==500||POOL_OPTIONS.connectionTimeoutMillis!==500)throw Error('contract');
 calls++;if(!pool.totalCount){pool.totalCount=1;pool.emit('connect');}pool.idleCount=0;
 if(scenario==='hung')return new Promise(()=>{});
 return new Promise((resolve,reject)=>{setTimeout(()=>{pool.idleCount=1;if(marker)Atomics.store(new Int32Array(marker),0,calls);if(scenario==='query-timeout'&&calls===1){pool.idleCount=0;pool.totalCount=0;reject(Error('Query read timeout'));}else if(scenario==='connection-timeout'){reject(Error('Connection terminated due to connection timeout'));}else if(scenario==='statement'){const e=Error('private SQL');e.code='57014';reject(e);}else if(scenario==='reject'){reject(Error('private token'));}else resolve({rows:scenario==='invalid'?null:[]});},scenario==='healthy-pending'?200:scenario==='query-timeout'?750:scenario==='connection-timeout'||scenario==='statement'?500:20);});
}});
if(scenario==='write-error'){fs.writeSync=()=>{throw Error('private-url-error');};syncBuiltinESMExports();}if(scenario==='pre-exit')process.exit(1);else {await runDatabaseSampler(data,pool,parentPort);if(marker){Atomics.store(new Int32Array(marker),1,Number(process.env.SAMPLER_PRIVATE===undefined&&process.execArgv.length===0));}if(scenario==='post-exit')setTimeout(()=>process.exit(1),20);}
`;
async function workerFixture(t, scenario = 'healthy') {
  const directory = owned(t),
    control = new SharedArrayBuffer(24),
    marker = new SharedArrayBuffer(8),
    data = {
      version: 1,
      directory,
      sourceSha: 'a'.repeat(40),
      runNonce: 'b'.repeat(32),
      connectionString: 'private-url',
      control,
    };
  const file = join(directory, 'test-worker.mjs');
  writeFileSync(file, workerSource, { mode: 0o600 });
  const writer = createSamplerWriter(
    directory,
    'api-observations.ndjson',
    control,
  );
  let receipt;
  const instance = createApiObserver({
    producer: 'api',
    databaseSampler: {
      version: 1,
      producer: 'api',
      runNonce: data.runNonce,
      sourceSha: data.sourceSha,
    },
    databaseWorker: () => receipt,
    write: writer.write,
    close: writer.close,
  });
  const worker = new Worker(new URL(`file://${file}`), {
    env: {},
    execArgv: [],
    workerData: { data, scenario, marker },
  });
  t.after(() => worker.terminate());
  const controller = await createSamplerController(worker, data);
  return {
    directory,
    data,
    marker,
    worker,
    controller,
    finish() {
      receipt = controller.stop();
      instance.stop();
      return receipt;
    },
    read() {
      return readIsolatedSampler(
        directory,
        readFileSync(join(directory, 'api-observations.ndjson')),
        data.sourceSha,
      );
    },
  };
}
test('real isolated worker completes exact2s cadence during2600ms busy main with8s child watchdog', (t) => {
  const directory = owned(t),
    workerFile = join(directory, 'test-worker.mjs'),
    childFile = join(directory, 'busy-child.mjs'),
    importFile = join(directory, 'inherited.mjs'),
    countFile = join(directory, 'import-count');
  writeFileSync(workerFile, workerSource, { mode: 0o600 });
  writeFileSync(
    importFile,
    `import {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(countFile)},'x',{mode:0o600});`,
    { mode: 0o600 },
  );
  writeFileSync(
    childFile,
    `import {Worker} from 'node:worker_threads';import {performance} from 'node:perf_hooks';import {readFileSync} from 'node:fs';import {createApiObserver} from ${JSON.stringify(observerCore)};import {createSamplerController,createSamplerWriter,readIsolatedSampler} from ${JSON.stringify(core)};
 const data={version:1,directory:${JSON.stringify(directory)},sourceSha:'a'.repeat(40),runNonce:'b'.repeat(32),connectionString:'private-url',control:new SharedArrayBuffer(24)},marker=new SharedArrayBuffer(8);const writer=createSamplerWriter(data.directory,'api-observations.ndjson',data.control);let receipt;const api=createApiObserver({producer:'api',databaseSampler:{version:1,producer:'api',runNonce:data.runNonce,sourceSha:data.sourceSha},databaseWorker:()=>receipt,write:writer.write,close:writer.close});
 const worker=new Worker(new URL(${JSON.stringify(`file://${workerFile}`)}),{env:{},execArgv:[],workerData:{data,marker,scenario:'healthy'}});const controller=await createSamplerController(worker,data);let delayed=false;setTimeout(()=>{delayed=true;},0);const busyStart=Date.now(),beforeBusy=Atomics.load(new Int32Array(marker),0),end=performance.now()+2600;while(performance.now()<end){}const endEpoch=Date.now(),whileBusy=Atomics.load(new Int32Array(marker),0),isolated=Atomics.load(new Int32Array(marker),1);receipt=controller.stop();api.stop();const evidence=readIsolatedSampler(data.directory,readFileSync(data.directory+'/api-observations.ndjson'),data.sourceSha),samples=evidence.database.filter(r=>r.kind==='database');console.log(JSON.stringify({delayed,beforeBusy,busyStart,whileBusy,isolated,state:receipt.state,samples,busyEnd:endEpoch,readyBeforeMain:evidence.api[0].startedAt<=evidence.database[0].startedAt}));await worker.terminate();`,
    { mode: 0o600 },
  );
  const result = spawnSync(
    process.execPath,
    ['--import', new URL(`file://${importFile}`).href, childFile],
    {
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, SAMPLER_PRIVATE: 'private-parent-canary' },
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.delayed, false);
  assert.equal(proof.beforeBusy, 0);
  assert.equal(proof.whileBusy, 1);
  assert.ok(proof.samples[0].end >= proof.busyStart);
  assert.equal(proof.isolated, 1);
  assert.equal(proof.state, 'complete');
  assert.equal(proof.samples.length, 1);
  assert.equal(proof.samples[0].outcome, 'success');
  assert.ok(proof.samples[0].end <= proof.busyEnd);
  assert.equal(proof.samples[0].connectionStateAtStart, 'initial');
  assert.equal(proof.samples[0].connectionGenerationBefore, 0);
  assert.equal(proof.samples[0].connectionGenerationAfter, 1);
  assert.equal(proof.readyBeforeMain, true);
  assert.equal(readFileSync(countFile, 'utf8'), 'x');
});
for (const [scenario, category, outcome] of [
  ['query-timeout', 'query-read-timeout', 'error'],
  ['connection-timeout', 'connection-timeout', 'error'],
  ['statement', 'query-canceled', 'timeout'],
  ['invalid', 'invalid-rows', 'error'],
  ['reject', 'other', 'error'],
])
  test(`real worker preserves ${scenario} terminal diagnostic during drain`, async (t) => {
    const f = await workerFixture(t, scenario);
    await new Promise((resolve) => setTimeout(resolve, 2050));
    assert.equal(f.finish().state, 'complete');
    const sample = f.read().database.find((r) => r.kind === 'database');
    assert.equal(sample.outcome, outcome);
    assert.equal(sample.diagnostic.category, category);
    assert.equal(sample.connectionGenerationBefore, 0);
    assert.equal(sample.connectionGenerationAfter, 1);
    assert.equal(JSON.stringify(f.read().records).includes('private'), false);
    if (scenario === 'query-timeout') {
      const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
      Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
      t.after(() => {
        if (previous === undefined)
          Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
        else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
      });
      const proof = {
          verificationRequired: true,
          noUnverifiedSession: true,
          acceptedMail: true,
          verifiedAuthentication: true,
        },
        mail = zeroMailStats();
      for (const actor of Object.keys(mail.accepted)) mail.accepted[actor] = 2;
      writeFileSync(
        join(f.directory, 'mail-stats.json'),
        JSON.stringify(mail),
        { mode: 0o600 },
      );
      writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', {
        mode: 0o600,
      });
      writeFileSync(join(f.directory, 'api.log'), 'healthy\n', { mode: 0o600 });
      const reportPath = join(f.directory, 'report.json'),
        report = {
          sourceSha: f.data.sourceSha,
          hasFailed: false,
          failures: [],
          fixtureProof: proof,
          mailStats: mail,
          inventoryTemplates: ['/v1/voices'],
          inventory: {},
          requests: [],
          apiLogHits: [],
          finalLogScannedAt: new Date().toISOString(),
        };
      const summary = writeDiagnosticEvidence(
        report,
        proof,
        f.directory,
        reportPath,
      );
      assert.equal(summary.causalEvidence.reasons.samplerFailure, 1);
      assert.equal(report.hasFailed, true);
      assert.equal(summary.causalEvidence.tenantFailures.available, true);
      const scanner = spawnSync(
        process.execPath,
        [new URL('./scan-log.mjs', import.meta.url).pathname],
        {
          encoding: 'utf8',
          timeout: 8000,
          env: {
            ...process.env,
            CLOUD_SWEEP_DIAGNOSTICS: '1',
            CLOUD_SWEEP_CPU_PROFILE: '0',
            CLOUD_SWEEP_RUN_DIR: f.directory,
            CLOUD_SWEEP_REPORT: reportPath,
            CLOUD_SWEEP_API_LOG: join(f.directory, 'api.log'),
            CLOUD_SWEEP_API_BOOT_OUTCOME: 'success',
          },
        },
      );
      assert.equal(scanner.status, 1, scanner.stderr);
      const final = JSON.parse(
        readFileSync(join(f.directory, 'diagnostic-summary.json'), 'utf8'),
      );
      assert.equal(final.causalEvidence.reasons.samplerFailure, 1);
      assert.equal(
        final.causalEvidence.database.failureGroups[0].category,
        'query-read-timeout',
      );
    }
  });
test('query failure is conserved through successful reconnect at next permitted cadence', async (t) => {
  const f = await workerFixture(t, 'query-timeout');
  await new Promise((resolve) => setTimeout(resolve, 4050));
  assert.equal(f.finish().state, 'complete');
  const samples = f.read().database.filter((r) => r.kind === 'database');
  assert.equal(samples.length, 2);
  assert.equal(samples[0].diagnostic.category, 'query-read-timeout');
  assert.equal(samples[1].outcome, 'success');
  assert.equal(samples[1].connectionStateAtStart, 'reconnect');
  assert.equal(samples[1].connectionGenerationAfter, 2);
});
for (const scenario of ['hung', 'hang-end'])
  test(`real hung ${scenario} remains fatal with truthful elapsed and8s cleanup watchdog`, (t) => {
    const directory = owned(t),
      file = join(directory, 'test-worker.mjs'),
      child = join(directory, 'hung-child.mjs');
    writeFileSync(file, workerSource, { mode: 0o600 });
    writeFileSync(
      child,
      `import {Worker} from 'node:worker_threads';import {performance} from 'node:perf_hooks';import {existsSync,readFileSync} from 'node:fs';import {createSamplerController,readIsolatedSampler} from ${JSON.stringify(core)};
 const data={version:1,directory:${JSON.stringify(directory)},sourceSha:'a'.repeat(40),runNonce:'b'.repeat(32),connectionString:'private-url',control:new SharedArrayBuffer(24)};const worker=new Worker(new URL(${JSON.stringify(`file://${file}`)}),{env:{},execArgv:[],workerData:{data,scenario:${JSON.stringify(scenario)}}});const controller=await createSamplerController(worker,data);if(${JSON.stringify(scenario)}==='hung')await new Promise(resolve=>setTimeout(resolve,2050));const start=performance.now(),receipt=controller.stop(),elapsed=performance.now()-start;const repeated=controller.stop()===receipt;let valid=false;try{readIsolatedSampler(data.directory,readFileSync(data.directory+'/api-observations.ndjson'),data.sourceSha);valid=true;}catch{}const hasSeal=existsSync(data.directory+'/database-observations.seal.json');console.log(JSON.stringify({state:receipt.state,fatal:Atomics.load(new Int32Array(data.control),3),elapsed,repeated,valid,hasSeal}));await worker.terminate();`,
      { mode: 0o600 },
    );
    const result = spawnSync(process.execPath, [child], {
      encoding: 'utf8',
      timeout: 8000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const proof = JSON.parse(result.stdout);
    assert.equal(proof.state, 'timeout');
    assert.equal(proof.fatal, 1);
    assert.equal(proof.repeated, true);
    assert.equal(proof.valid, false);
    assert.equal(proof.hasSeal, false);
    assert.ok(Number.isFinite(proof.elapsed) && proof.elapsed >= 0);
    t.diagnostic(`actual stop elapsedMs=${proof.elapsed}`);
  });
test('pre-ready worker exit rejects with fixed redacted failure', async (t) => {
  await assert.rejects(workerFixture(t, 'pre-exit'), {
    message: 'Database sampler evidence unavailable',
  });
});
test('after-ready nonzero exit cannot acknowledge successful sealing', async (t) => {
  const f = await workerFixture(t, 'post-exit');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(f.finish().state, 'failed');
  assert.throws(f.read);
});
test('duplicate stop returns one unchanged native receipt and seal', async (t) => {
  const f = await workerFixture(t);
  const first = f.finish();
  assert.equal(first.state, 'complete');
  assert.equal(f.controller.stop(), first);
  assert.equal(f.read().database.length, 2);
});

for (const mode of [
  'normal0',
  'normal1',
  'earlyTERM',
  'earlyINT',
  'handledTERM',
  'handledINT',
  'removedTERM',
  'removedINT',
])
  test(`native child passive stop preserves actual exit/signal: ${mode}`, (t) => {
    const directory = owned(t),
      workerFile = join(directory, 'test-worker.mjs'),
      childFile = join(directory, 'child.mjs');
    writeFileSync(workerFile, workerSource, { mode: 0o600 });
    writeFileSync(
      childFile,
      `
 import {Worker} from 'node:worker_threads';import {createApiObserver} from ${JSON.stringify(observerCore)};import {createSamplerController,createSamplerWriter,installPassiveSamplerStop} from ${JSON.stringify(core)};
 const data={version:1,directory:${JSON.stringify(directory)},sourceSha:'a'.repeat(40),runNonce:'b'.repeat(32),connectionString:'private-url',control:new SharedArrayBuffer(24)};
 const writer=createSamplerWriter(data.directory,'api-observations.ndjson',data.control);let receipt;const instance=createApiObserver({producer:'api',databaseSampler:{version:1,producer:'api',runNonce:data.runNonce,sourceSha:data.sourceSha},databaseWorker:()=>receipt,write:writer.write,close:writer.close});
 const worker=new Worker(new URL(${JSON.stringify(`file://${workerFile}`)}),{env:{},execArgv:[],workerData:{data,scenario:'healthy'}});const controller=await createSamplerController(worker,data);let drains=0;
 installPassiveSamplerStop(()=>{drains++;const r=controller.stop();receipt=r;console.log(JSON.stringify({drains,state:r.state}));return r;});
 process.once('exit',()=>{instance.stop();console.log(JSON.stringify({mainStopped:true}));});
 const mode=${JSON.stringify(mode)};const signal=mode.endsWith('INT')?'SIGINT':'SIGTERM';
 if(mode.startsWith('handled'))process.on(signal,()=>{process.removeAllListeners(signal);process.kill(process.pid,signal);});
 if(mode.startsWith('removed')){const fn=()=>{};process.on(signal,fn);process.removeListener(signal,fn);}
 if(mode==='normal0'||mode==='normal1')process.exit(mode==='normal0'?0:1);else {setTimeout(()=>process.kill(process.pid,signal),20);setInterval(()=>{},1000);}
 `,
      { mode: 0o600 },
    );
    const result = spawnSync(process.execPath, [childFile], {
      encoding: 'utf8',
      timeout: 8000,
    });
    assert.equal(result.error, undefined);
    if (mode.startsWith('normal')) {
      assert.equal(result.status, mode === 'normal0' ? 0 : 1);
      assert.match(result.stdout, /"drains":1,"state":"complete"/);
      assert.match(result.stdout, /"mainStopped":true/);
      assert.ok(
        result.stdout.indexOf('drains') < result.stdout.indexOf('mainStopped'),
      );
      assert.doesNotThrow(() =>
        readIsolatedSampler(
          directory,
          readFileSync(join(directory, 'api-observations.ndjson')),
          'a'.repeat(40),
        ),
      );
    } else {
      assert.equal(result.signal, mode.endsWith('INT') ? 'SIGINT' : 'SIGTERM');
      if (mode.startsWith('handled'))
        assert.match(result.stdout, /"drains":1,"state":"complete"/);
      else assert.equal(result.stdout, '');
    }
    const sealed = (() => {
      try {
        return JSON.parse(
          readFileSync(
            join(directory, 'database-observations.seal.json'),
            'utf8',
          ),
        );
      } catch {
        return null;
      }
    })();
    assert.equal(
      sealed !== null,
      mode.startsWith('normal') || mode.startsWith('handled'),
    );
  });

test('stop during a healthy pending query drains exactly its one original terminal sample', async (t) => {
  const f = await workerFixture(t, 'healthy-pending');
  await new Promise((resolve) => setTimeout(resolve, 2050));
  assert.equal(Atomics.load(new Int32Array(f.marker), 0), 0);
  const receipt = f.finish();
  assert.equal(receipt.state, 'complete');
  const samples = f.read().database.filter((r) => r.kind === 'database');
  assert.equal(samples.length, 1);
  assert.equal(samples[0].outcome, 'success');
  assert.ok(samples[0].end >= receipt.stopRequestedAt);
  assert.equal(Atomics.load(new Int32Array(f.marker), 0), 1);
});

for (const scenario of ['fsync-error', 'close-error'])
  test(`native ${scenario} cannot acknowledge or seal success`, async (t) => {
    const f = await workerFixture(t, scenario);
    assert.equal(f.finish().state, 'failed');
    assert.throws(f.read);
  });
test('native pre-ready write failure rejects without native payload', async (t) => {
  await assert.rejects(workerFixture(t, 'write-error'), {
    message: 'Database sampler evidence unavailable',
  });
});
test('unknown private control message remains failed and cannot be repaired by subsequent stop', async (t) => {
  const f = await workerFixture(t);
  f.worker.postMessage({ type: 'unknown', private: 'private-token' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(f.finish().state, 'failed');
  assert.throws(f.read);
});
