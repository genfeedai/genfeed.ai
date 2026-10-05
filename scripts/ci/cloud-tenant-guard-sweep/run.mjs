// Exercises live OpenAPI GETs and the agent/MCP tool union with CLOUD tenant
// enforcement, independent dual-org members, and superadmin override contexts.
// Strict or unbaselined S:A tenant hits, incomplete coverage and >5% timeouts fail.
// Local reproduction ONLY on a host authorized to build/boot the API: provision
// disposable pgvector Postgres 17 (genfeed/genfeed_local, DB test) and Redis 7;
// build with `bunx turbo run build --filter=@genfeedai/api` BEFORE loading config.
// Then `set -a; source scripts/ci/cloud-tenant-guard-sweep/cloud-sweep.placeholders;
// set +a`; run `bun x prisma migrate deploy` in packages/prisma, boot
// `node apps/server/dist/apps/api/main.js > /tmp/api.log 2>&1`, and run
// `bun run ci:cloud-tenant-guard-sweep`. Stop the API and run scan-log.mjs with
// RUNNER_TEMP=/tmp to catch deferred hits. Never point this fixture at retained DBs.
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  captureOverrideLogOffset,
  classifyHits,
  hitSummary,
  loadBaseline,
  logEvidence,
  OVERRIDE_PHASE,
} from './baseline.mjs';
import {
  concurrentMap,
  coverageErrors,
  createConcurrencyLimiter,
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
import {
  activate,
  printFixtureFailure,
  seedFixture,
  sweepOrganizationAndGrants,
  warmup,
} from './fixture.mjs';
import { createRequester } from './http.mjs';

// The repo root does not link every workspace package, so resolve the ones the
// harness needs through the API workspace, which depends on both.
const apiWorkspaceRequire = createRequire(
  new URL('../../../apps/server/api/package.json', import.meta.url),
);

function importFromApiWorkspace(specifier) {
  return import(pathToFileURL(apiWorkspaceRequire.resolve(specifier)).href);
}

const started = performance.now();
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
const measure = (name, run) => measurePhase(durations, name, run);
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
  if (
    process.env.CI !== 'true' ||
    process.env.GENFEED_CLOUD !== 'true' ||
    process.env.NODE_ENV !== 'test' ||
    process.env.DATABASE_URL !==
      'postgresql://genfeed:genfeed_local@localhost:5432/test'
  ) {
    throw new Error(
      'Sweep requires CI=true, GENFEED_CLOUD=true, NODE_ENV=test and the job-local ephemeral test database',
    );
  }
  baseline = loadBaseline();
  const { prisma: client } = await importFromApiWorkspace(
    '@genfeedai/prisma/client',
  );
  prisma = client;
  const { getToolsForSurface, isReadOnlyToolName } =
    await importFromApiWorkspace('@genfeedai/actions');
  const setupRequest = createRequester({
    baseUrl: 'http://127.0.0.1:3010',
    records,
    phase: 'fixture',
  });
  let document;
  try {
    document = await measure('warmup', () => warmup(setupRequest));
  } finally {
    process.stdout.write(`API warm-up: ${durations.warmup} ms\n`);
  }
  const fixture = await measure('fixture', () =>
    seedFixture(setupRequest, prisma),
  );
  isSetup = false;
  sweepSignal = AbortSignal.timeout(480_000);
  const limit = createConcurrencyLimiter(10);
  const request = createRequester({
    baseUrl: 'http://127.0.0.1:3010',
    records,
    sweepSignal,
    limit,
  });
  const routes = await measure('discovery', async () => getRoutes(document));
  skipped.push(
    ...routes
      .filter((route) => route.skipReason)
      .map(({ parameters: _, ...route }) => route),
  );
  const targets = routes.filter((route) => !route.skipReason);
  routeCount = targets.length;
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
  const tools = distinctTools(
    getToolsForSurface('agent'),
    getToolsForSurface('mcp'),
  );
  toolCount = tools.length;
  readOnlyToolCount = tools.filter(
    (tool) =>
      !tool.annotations?.destructiveHint &&
      (tool.annotations?.readOnlyHint || isReadOnlyToolName(tool.name)),
  ).length;
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
  superadminOverrideLogOffset = await captureOverrideLogOffset(apiLog);
  process.stdout.write(
    `S:A API log boundary: ${superadminOverrideLogOffset} bytes\n`,
  );
  await getPhase(contexts[3], OVERRIDE_PHASE);
  failures.push(
    ...coverageErrors(records, routeCount, toolCount, readOnlyToolCount),
  );
} catch (error) {
  failures.push(String(error));
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
  const hasFailed = groups.length > 0 || failures.length > 0;
  const report = {
    generatedAt: new Date().toISOString(),
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
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Cloud tenant guard: ${routeCount} GET routes × 4 actors, ${toolCount} tools as M:A + ${readOnlyToolCount} read-only tools as S\n`,
  );
  process.stdout.write(`${hitSummary(report)}\n`);
  for (const failure of failures) process.stdout.write(`FAIL ${failure}\n`);
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
      `Cloud tenant guard: ${hasFailed ? 'FAILED' : 'PASSED'}\n\n${phaseSummary}\n\n${summary}\n\nTimeouts: ${timeouts.count}/${timeouts.requests} (${(timeouts.ratio * 100).toFixed(2)}%)\n\nTenant hit groups: ${groups.length}; known S:A groups: ${report.knownHits.length}; stale baseline entries: ${report.staleBaselineEntries.length}\n`,
    );
  process.stdout.write(`JSON report: ${reportPath}\n`);
  process.exitCode = hasFailed ? 1 : 0;
}
