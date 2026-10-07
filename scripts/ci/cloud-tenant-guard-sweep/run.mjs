import { cpuActivation, writeCpuTrigger } from './cpu-profile-core.mjs';
// Exercises live OpenAPI GETs and the agent/MCP tool union with CLOUD tenant
// enforcement, independent dual-org members, and superadmin override contexts.
// Strict or unbaselined S:A tenant hits, incomplete coverage and unresolved timeout/transport failures fail.
// Local reproduction is Studio-only: validate a new disposable database and
// isolated API/Redis coordinates; launch Node from an owned empty cwd with only
// allowlisted synthetic configuration and the restricted local mail adapter.
// Preserve the private resource ledger/logs and stop only owned children before
// final log scanning and dropping only the freshly created owned database.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  captureOverrideLogOffset,
  classifyHits,
  loadBaseline,
  logEvidence,
  OVERRIDE_PHASE,
  trustedBaseline,
  validateBaselineRatchet,
} from './baseline.mjs';
import { validateRuntimeConfig } from './config.mjs';
import {
  concurrentMap,
  coverageErrors,
  createConcurrencyLimiter,
  createDeadline,
  distinctTools,
  durationSummary,
  expandRoute,
  getContexts,
  getRoutes,
  measurePhase,
  phaseRequestStats,
  schemaValue,
  sweepGets,
  sweepTools,
  timeoutStats,
  toolSkipReason,
} from './core.mjs';
import { writeDiagnosticEvidence } from './diagnostic-output.mjs';
import {
  activate,
  printFixtureFailure,
  seedFixture,
  sweepOrganizationAndGrants,
  warmup,
} from './fixture.mjs';
import { createRequester } from './http.mjs';
import { createWorkspaceImporter } from './imports.mjs';
import { readMailStats, validateRunDirectory } from './local-mail-stub.mjs';

// The repo root does not link every workspace package, so resolve the ones the
// harness needs through the API workspace, which depends on both.
const apiWorkspaceRequire = createRequire(
  new URL('../../../apps/server/api/package.json', import.meta.url),
);

const started = performance.now();
const deadline = createDeadline(570_000, { source: 'overall' });
let sweepSignal;
let isSetup = true;
const durations = {
  warmup: 0,
  fixture: 0,
  discovery: 0,
  memberAGets: 0,
  memberBGets: 0,
  superadminGets: 0,
  controls: 0,
  readOnlyTools: 0,
  writeTools: 0,
  destructiveTools: 0,
  superadminOverrideGets: 0,
};
const phaseElapsed = {};
const measure = async (name, run) => {
  const startMs = Math.round(performance.now() - started);
  try {
    return await measurePhase(durations, name, run);
  } finally {
    phaseElapsed[name] = {
      startMs,
      endMs: Math.round(performance.now() - started),
    };
  }
};
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: new URL('../../../', import.meta.url),
  encoding: 'utf8',
}).trim();
let diagnosticSequence = 0;
const nextSequence =
  Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS') === '1'
    ? () => {
        diagnosticSequence++;
        if (!Number.isSafeInteger(diagnosticSequence))
          throw new Error('Diagnostic sequence exhausted');
        return diagnosticSequence;
      }
    : undefined;
const inventory = {};
const inventoryTemplates = [];
let fixtureProof = {};
let mailStats;
const limit = createConcurrencyLimiter(10);
const progress = new Map();
const onProgress = (event, actor, options) => {
  const phase = options.sweepPhase ?? options.phase;
  const label = actor?.label ?? 'anonymous';
  const values = inventory[phase]?.[label];
  if (!values) return;
  const key = `${phase}/${label}/${options.route}`;
  const observed = progress.get(key) ?? new Set();
  if (phase === 'controls' || !observed.has(event)) {
    if (values[event] < values.discovered) values[event]++;
    observed.add(event);
    progress.set(key, observed);
  }
};
const planInventory = (phase, actor, discovered) => {
  inventory[phase] ??= {};
  inventory[phase][actor] = {
    discovered,
    enqueued: 0,
    started: 0,
    completed: 0,
  };
};
const records = [];
const skipped = [];
const failures = [];
const reportPath = resolve(
  process.env.CLOUD_SWEEP_REPORT ??
    `${process.env.RUNNER_TEMP ?? '/tmp'}/cloud-tenant-guard-report.json`,
);
const apiLog =
  process.env.CLOUD_SWEEP_API_LOG ??
  `${process.env.RUNNER_TEMP ?? '/tmp'}/api.log`;
let routeCount = 0;
let toolCount = 0;
let readOnlyToolCount = 0;
let superadminOverrideLogOffset = null;
let baseline = { issue: 'TBD', entries: [] };
let prisma;

try {
  const runtime = validateRuntimeConfig(process.env);
  const cpuEnabled = cpuActivation(process.env, runtime.mode === 'ci');
  validateRunDirectory(Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'));
  mailStats = readMailStats(Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'));
  const importFromApiWorkspace = createWorkspaceImporter({
    mode: runtime.mode,
    resolveSpecifier: (specifier) => apiWorkspaceRequire.resolve(specifier),
    parentURL: import.meta.url,
  });
  baseline = validateBaselineRatchet(loadBaseline(), trustedBaseline());
  const { prisma: client } = await importFromApiWorkspace(
    '@genfeedai/prisma/client',
  );
  prisma = client;
  const { getToolsForSurface, isReadOnlyToolName } =
    await importFromApiWorkspace('@genfeedai/actions');
  const setupRequest = createRequester({
    nextSequence,
    baseUrl: runtime.baseUrl,
    records,
    phase: 'fixture',
    deadline,
  });
  let document;
  try {
    document = await measure('warmup', () => warmup(setupRequest));
  } finally {
    process.stdout.write(`API warm-up: ${durations.warmup} ms\n`);
  }
  const routes = await measure('discovery', async () => getRoutes(document));
  skipped.push(
    ...routes
      .filter((route) => route.skipReason)
      .map(({ parameters: _, ...route }) => route),
  );
  const targets = routes.filter((route) => !route.skipReason);
  const tools = distinctTools(
    getToolsForSurface('agent'),
    getToolsForSurface('mcp'),
  );
  routeCount = targets.length;
  toolCount = tools.length;
  inventoryTemplates.push(
    ...targets.map((route) => route.path),
    ...tools.map((tool) => `/v1/agent-tools/${tool.name}/execute`),
  );
  readOnlyToolCount = tools.filter(
    (tool) =>
      !tool.annotations?.destructiveHint &&
      (tool.annotations?.readOnlyHint || isReadOnlyToolName(tool.name)),
  ).length;
  for (const [phase, actor] of [
    ['memberAGets', 'M:A'],
    ['memberBGets', 'M2:B'],
    ['superadminGets', 'S'],
    ['superadminOverrideGets', 'S:A'],
  ])
    planInventory(phase, actor, routeCount);
  for (const phase of ['readOnlyTools', 'writeTools', 'destructiveTools']) {
    const selected = tools.filter(
      (tool) =>
        (tool.annotations?.destructiveHint
          ? 'destructiveTools'
          : tool.annotations?.readOnlyHint || isReadOnlyToolName(tool.name)
            ? 'readOnlyTools'
            : 'writeTools') === phase,
    );
    planInventory(phase, 'M:A', selected.length);
    if (phase === 'readOnlyTools') planInventory(phase, 'S', selected.length);
  }
  for (const [actor, discovered] of [
    ['M', 10],
    ['S', 5],
    ['A', 2],
    ['B', 2],
  ])
    planInventory('controls', actor, discovered);
  const fixture = await measure('fixture', () =>
    seedFixture(setupRequest, prisma, {
      deadline: createDeadline(Math.min(240_000, deadline.remaining()), {
        parentSignal: deadline.signal,
        parentAbortSources: deadline.abortSources,
        source: 'fixture/readiness',
      }),
      readMailStats: () =>
        readMailStats(
          Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'),
          mailStats,
        ),
    }),
  );
  fixtureProof = fixture.proof;
  mailStats = fixture.mailStats;
  isSetup = false;
  const sweepDeadline = createDeadline(
    Math.min(480_000, deadline.remaining()),
    {
      parentSignal: deadline.signal,
      parentAbortSources: deadline.abortSources,
      source: 'sweep',
    },
  );
  sweepSignal = sweepDeadline.signal;
  const request = createRequester({
    nextSequence,
    baseUrl: runtime.baseUrl,
    records,
    sweepSignal,
    deadline,
    limit,
    abortSources: sweepDeadline.abortSources,
    onProgress,
  });
  const contexts = getContexts(fixture);
  const getWorker = async (
    { actor, organization, override },
    route,
    sweepPhase,
  ) => {
    try {
      const path = expandRoute(
        route,
        { ...organization, userId: actor.userId },
        document,
        override,
      );
      await request(actor, 'GET', path, {
        phase: 'get',
        sweepPhase,
        route: route.path,
      });
    } catch (error) {
      failures.push(`Expand/request ${actor.label} ${route.path}: ${error}`);
    }
  };
  const getPhase = (context, name) =>
    measure(name, () => {
      process.stdout.write(
        `GET sweep ${context.actor.label}: ${targets.length} routes\n`,
      );
      return sweepGets(
        [context],
        targets,
        (context, route) => getWorker(context, route, name),
        sweepSignal,
      );
    });
  if (cpuEnabled) {
    try {
      writeCpuTrigger(Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'));
    } catch {
      failures.push('CPU profile trigger unavailable');
    }
  }
  // All strict phases finish before the override boundary is recorded.
  await concurrentMap(
    contexts.slice(0, 3),
    3,
    (context, index) =>
      getPhase(
        context,
        ['memberAGets', 'memberBGets', 'superadminGets'][index],
      ),
    sweepSignal,
  );
  await measure('controls', async () => {
    await sweepOrganizationAndGrants(request, fixture);
    await activate(request, fixture.member, fixture.orgA);
    await activate(request, fixture.superadmin, fixture.orgS);
  });
  await sweepTools(
    tools,
    [contexts[0], contexts[2]],
    isReadOnlyToolName,
    async ({ actor, organization }, tool, sweepPhase) => {
      try {
        const result = await request(
          actor,
          'POST',
          `/v1/agent-tools/${encodeURIComponent(tool.name)}/execute`,
          {
            phase: 'tool',
            sweepPhase,
            route: `/v1/agent-tools/${tool.name}/execute`,
            body: {
              parameters: schemaValue(tool.parameters, '', {
                ...organization,
                userId: actor.userId,
              }),
              context: { brandId: organization.brandId },
            },
          },
        );
        const skipReason = toolSkipReason(result.record.status, result.body);
        if (skipReason) {
          result.record.skipReason = skipReason;
          skipped.push({ actor: actor.label, tool: tool.name, skipReason });
        }
      } catch (error) {
        failures.push(`Tool ${actor.label} ${tool.name}: ${error}`);
      }
    },
    measure,
    sweepSignal,
  );
  superadminOverrideLogOffset = await captureOverrideLogOffset(apiLog, (ms) =>
    delay(ms, undefined, { signal: sweepSignal }),
  );
  process.stdout.write(
    `S:A API log boundary: ${superadminOverrideLogOffset} bytes\n`,
  );
  await getPhase(contexts[3], OVERRIDE_PHASE);
  failures.push(
    ...coverageErrors(records, routeCount, toolCount, readOnlyToolCount),
  );
} catch (error) {
  failures.push('Harness required proof or execution failed');
  if (isSetup) printFixtureFailure(error, records, apiLog);
} finally {
  if (prisma)
    await prisma
      .$disconnect()
      .catch((error) => failures.push(`Disconnect fixture client: ${error}`));
  let lines = [];
  try {
    lines = logEvidence(readFileSync(apiLog), superadminOverrideLogOffset);
  } catch (error) {
    failures.push(`Cannot scan API stdout: ${error}`);
  }
  const classification = classifyHits(records, lines, baseline);
  const groups = classification.tenantHitGroups;
  const warnings = records.filter(
    (result) => result.status >= 500 && !result.hasTenantHit,
  );
  if (sweepSignal?.aborted)
    failures.push('Sweep exceeded its 480-second wall-clock budget');
  const timeouts = timeoutStats(records);
  durations.total = Math.round(performance.now() - started);
  const summary = durationSummary(durations);
  const phases = phaseRequestStats(records, durations);
  if (timeouts.hasExceededLimit)
    failures.push(
      `${timeouts.count} unresolved timeout/transport requests cannot prove tenant safety`,
    );
  if (deadline.signal.aborted)
    failures.push('Harness exceeded its 570-second overall budget');
  const hasFailed = groups.length > 0 || failures.length > 0;
  const report = {
    generatedAt: new Date().toISOString(),
    sourceSha,
    inventory,
    inventoryTemplates,
    phaseElapsed,
    fixtureProof,
    mailStats,
    limiter: limit.stats,
    hasFailed,
    failures,
    skipped,
    durationUnit: 'milliseconds',
    durations,
    phases,
    superadminOverrideLogOffset,
    coverage: {
      getRoutes: routeCount,
      tools: toolCount,
      readOnlyTools: readOnlyToolCount,
    },
    requests: records,
    apiLogHits: lines,
    ...classification,
    warnings: {
      other5xx: warnings.length,
      timeouts,
      routes: [
        ...new Set(
          warnings.map((result) => `${result.method} ${result.route}`),
        ),
      ],
    },
  };
  try {
    writeDiagnosticEvidence(
      report,
      fixtureProof,
      Reflect.get(process.env, 'CLOUD_SWEEP_RUN_DIR'),
      reportPath,
    );
  } catch {
    report.hasFailed = true;
    if (!failures.includes('Final diagnostic evidence unavailable'))
      failures.push('Final diagnostic evidence unavailable');
    process.exitCode = 1;
  }
  process.stdout.write(
    `Cloud tenant guard: ${routeCount} GET routes × 4 actors, ${toolCount} tools as M:A + ${readOnlyToolCount} read-only tools as S\n`,
  );
  process.stdout.write(
    `Tenant hit groups=${groups.length}; failures=${failures.length}\n`,
  );
  if (warnings.length)
    process.stdout.write(
      `::warning::${warnings.length} other HTTP 5xx responses (see JSON report)\n`,
    );
  if (timeouts.count)
    process.stdout.write(
      `::warning::${timeouts.count}/${timeouts.requests} requests timed out (${(timeouts.ratio * 100).toFixed(2)}%); responses cannot prove absence of tenant hits\n`,
    );
  process.stdout.write(`${summary}\n`);
  const phaseSummary = [
    '| Phase | Requests | Attempts | Timeouts | Seconds |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...Object.entries(phases).map(
      ([name, phase]) =>
        `| ${name} | ${phase.requests} | ${phase.attempts} | ${phase.timeouts} | ${(durations[name] / 1_000).toFixed(2)} |`,
    ),
  ].join('\n');
  process.stdout.write(`${phaseSummary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Cloud tenant guard: ${report.hasFailed ? 'FAILED' : 'PASSED'}\n\n${phaseSummary}\n\n${summary}\n\nTimeouts: ${timeouts.count}/${timeouts.requests} (${(timeouts.ratio * 100).toFixed(2)}%)\n\nTenant hit groups: ${groups.length}; known S:A groups: ${report.knownHits.length}; stale baseline entries: ${report.staleBaselineEntries.length}\n`,
    );
  process.exitCode = report.hasFailed || failures.length ? 1 : 0;
}
