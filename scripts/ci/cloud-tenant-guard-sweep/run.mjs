// Exercises live OpenAPI GETs and the agent/MCP tool union with CLOUD tenant
// enforcement, independent dual-org members, and superadmin override contexts.
// Tenant hits (including API stdout), incomplete coverage, and >5% timeouts fail.
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
  coverageErrors,
  distinctTools,
  durationSummary,
  expandRoute,
  getContexts,
  getRoutes,
  groupHits,
  logHits,
  measurePhase,
  schemaValue,
  sweepGets,
  sweepTools,
  timeoutStats,
  toolSkipReason,
} from './core.mjs';
import {
  activate,
  seedFixture,
  sweepOrganizationAndGrants,
} from './fixture.mjs';
import { createRequester, requireSuccess } from './http.mjs';

// The repo root does not link every workspace package, so resolve the ones the
// harness needs through the API workspace, which depends on both.
const apiWorkspaceRequire = createRequire(
  new URL('../../../apps/server/api/package.json', import.meta.url),
);

function importFromApiWorkspace(specifier) {
  return import(pathToFileURL(apiWorkspaceRequire.resolve(specifier)).href);
}

const started = performance.now();
const sweepSignal = AbortSignal.timeout(230_000);
const durations = {
  fixture: 0,
  discovery: 0,
  gets: 0,
  controls: 0,
  readOnlyTools: 0,
  writeTools: 0,
  destructiveTools: 0,
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
  const { prisma: client } = await importFromApiWorkspace(
    '@genfeedai/prisma/client',
  );
  prisma = client;
  const { getToolsForSurface, isReadOnlyToolName } =
    await importFromApiWorkspace('@genfeedai/actions');
  const request = createRequester({
    baseUrl: 'http://127.0.0.1:3010',
    records,
    sweepSignal,
  });
  const fixture = await measure('fixture', () => seedFixture(request, prisma));
  const document = await measure('discovery', async () =>
    requireSuccess(
      await request(fixture.member, 'GET', '/v1/openapi.json'),
      'Live OpenAPI',
    ),
  );
  const routes = getRoutes(document);
  skipped.push(
    ...routes
      .filter((route) => route.skipReason)
      .map(({ parameters: _, ...route }) => route),
  );
  const targets = routes.filter((route) => !route.skipReason);
  routeCount = targets.length;
  const contexts = getContexts(fixture);
  for (const { actor } of contexts)
    process.stdout.write(
      `GET sweep ${actor.label}: ${targets.length} routes\n`,
    );
  await measure('gets', () =>
    sweepGets(
      contexts,
      targets,
      async ({ actor, organization, override }, route) => {
        try {
          const path = expandRoute(
            route,
            { ...organization, userId: actor.userId },
            document,
            override,
          );
          await request(actor, 'GET', path, {
            phase: 'get',
            route: route.path,
          });
        } catch (error) {
          failures.push(`Expand ${actor.label} ${route.path}: ${error}`);
        }
      },
      sweepSignal,
    ),
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
  await sweepTools(
    tools,
    [contexts[0], contexts[2]],
    isReadOnlyToolName,
    async ({ actor, organization }, tool) => {
      try {
        const result = await request(
          actor,
          'POST',
          `/v1/agent-tools/${encodeURIComponent(tool.name)}/execute`,
          {
            phase: 'tool',
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
  failures.push(...coverageErrors(records, routeCount, toolCount));
} catch (error) {
  failures.push(String(error));
} finally {
  if (prisma)
    await prisma
      .$disconnect()
      .catch((error) => failures.push(`Disconnect fixture client: ${error}`));
  let lines = [];
  try {
    lines = logHits(readFileSync(apiLog, 'utf8'));
  } catch (error) {
    failures.push(`Cannot scan API stdout: ${error}`);
  }
  const groups = groupHits(records, lines);
  const warnings = records.filter(
    (result) => result.status >= 500 && !result.hasTenantHit,
  );
  if (sweepSignal.aborted)
    failures.push('Sweep exceeded its 230-second wall-clock budget');
  const timeouts = timeoutStats(records);
  durations.total = Math.round(performance.now() - started);
  const summary = durationSummary(durations);
  const hasFailed = groups.length > 0 || failures.length > 0;
  const report = {
    generatedAt: new Date().toISOString(),
    hasFailed,
    failures,
    skipped,
    durationUnit: 'milliseconds',
    durations,
    coverage: { getRoutes: routeCount, tools: toolCount },
    requests: records,
    apiLogHits: lines,
    tenantHitGroups: groups,
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
    `Cloud tenant guard: ${routeCount} GET routes × 4 actors, ${toolCount} tools × 2 actors\n`,
  );
  for (const group of groups)
    process.stdout.write(
      `TENANT HIT ${group.model}.${group.operation} ${group.route} (${group.count} hits; ${group.actors.join(', ')})\n  ${group.messages.join('\n  ')}\n`,
    );
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
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${summary}\n\nTimeouts: ${timeouts.count}/${timeouts.requests} (${(timeouts.ratio * 100).toFixed(2)}%)\n`,
    );
  process.stdout.write(`JSON report: ${reportPath}\n`);
  process.exitCode = hasFailed ? 1 : 0;
}
