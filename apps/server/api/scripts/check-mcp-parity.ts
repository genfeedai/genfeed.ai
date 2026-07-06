/**
 * API↔MCP parity gate (#1251, epic #1246).
 *
 * Enforces the reachability invariant: every non-internal API operation in the
 * committed OpenAPI artifact must be reachable through some MCP tool. It:
 *   1. reads the committed spec (apps/server/api/openapi/openapi.json),
 *   2. subtracts the internal-route allowlist (openapi-internal-routes.json),
 *   3. reads the coverage map (openapi-mcp-coverage.json) — which capability
 *      tools reach which operations — validated against the MCP tool set from
 *      `@genfeedai/tools` (`getToolsForSurface('mcp')`),
 *   4. subtracts the reviewed parity baseline (openapi-parity-baseline.json),
 * and exits non-zero if any uncovered non-allowlisted operation is NOT in the
 * baseline (a new endpoint no tool reaches), or if the baseline holds a stale
 * entry that is now covered/allowlisted/removed.
 *
 * Parity is a reachability contract, not a 1:1 endpoint mirror — one ergonomic
 * tool may cover many operations. The coverage map starts empty (curation
 * #1252 + dispatcher #1249 populate it), so the baseline acknowledges the full
 * current gap. The ledger only ratchets down: as operations become reachable
 * their baseline entries must be removed (`--update-baseline`), and this gate
 * fails if they are not.
 *
 * Usage:
 *   bun run scripts/check-mcp-parity.ts                 # enforce (CI)
 *   bun run scripts/check-mcp-parity.ts --spec=/tmp/x.json
 *   bun run scripts/check-mcp-parity.ts --update-baseline  # regenerate ledger
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getToolsForSurface } from '@genfeedai/tools';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  computeMcpParityReport,
  findBaselineMetadataDrift,
} from '../src/helpers/utils/openapi/mcp-parity.util';
import { collectOperations } from '../src/helpers/utils/openapi/openapi-spec-validation.util';
import type {
  IMcpParityBaseline,
  IMcpToolCoverageMap,
  IOpenApiInternalRouteAllowlist,
} from '../src/shared/interfaces/openapi/openapi-spec.interface';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptsDir, '..');
const CONFIG_DIR = join(apiDir, 'src', 'config');

const DEFAULT_SPEC_PATH = join(apiDir, 'openapi', 'openapi.json');
const ALLOWLIST_PATH = join(CONFIG_DIR, 'openapi-internal-routes.json');
const COVERAGE_PATH = join(CONFIG_DIR, 'openapi-mcp-coverage.json');
const BASELINE_PATH = join(CONFIG_DIR, 'openapi-parity-baseline.json');

const BASELINE_DESCRIPTION =
  'Parity debt ledger (#1251): non-internal API operations in ' +
  'openapi/openapi.json that are NOT yet reachable via any capability MCP ' +
  'tool. Reachability is declared in openapi-mcp-coverage.json (one tool may ' +
  'cover many operations); until curation (#1252) / the dispatcher (#1249) ' +
  'populate that map, this acknowledges the current gap. This ledger only ' +
  'ratchets down: as operations become reachable they must be removed ' +
  '(regenerate with `bun run --filter=@genfeedai/api mcp:parity:update`). CI ' +
  '(scripts/check-mcp-parity.ts) fails on any uncovered operation absent from ' +
  'this list, and on any stale entry that is now covered/allowlisted/removed.';

function parseSpecPath(): string {
  const specArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--spec='))
    ?.split('=')[1];

  if (!specArg) {
    return DEFAULT_SPEC_PATH;
  }

  return isAbsolute(specArg) ? specArg : resolve(process.cwd(), specArg);
}

function serializeBaseline(baseline: IMcpParityBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

function main(): void {
  const isUpdate = process.argv.slice(2).includes('--update-baseline');
  const specPath = parseSpecPath();

  const document = JSON.parse(readFileSync(specPath, 'utf8')) as OpenAPIObject;
  const allowlist = JSON.parse(
    readFileSync(ALLOWLIST_PATH, 'utf8'),
  ) as IOpenApiInternalRouteAllowlist;
  const coverageMap = JSON.parse(
    readFileSync(COVERAGE_PATH, 'utf8'),
  ) as IMcpToolCoverageMap;

  const operations = collectOperations(
    document as unknown as Record<string, unknown>,
  );
  const mcpToolNames = new Set(
    getToolsForSurface('mcp').map((tool) => tool.name),
  );

  if (isUpdate) {
    // Regenerate the ledger from the current uncovered set (empty baseline so
    // every uncovered op surfaces), then write it back canonically.
    const { uncovered, stats } = computeMcpParityReport({
      baselineOperationIds: new Set<string>(),
      coverage: coverageMap.coverage,
      internalRoutes: allowlist.internalRoutes,
      mcpToolNames,
      operations,
    });

    const sortedOperations = [...uncovered].sort((a, b) =>
      (a.operationId ?? '').localeCompare(b.operationId ?? ''),
    );

    const baseline: IMcpParityBaseline = {
      description: BASELINE_DESCRIPTION,
      operations: sortedOperations,
    };

    writeFileSync(BASELINE_PATH, serializeBaseline(baseline));
    console.info(
      `Parity baseline regenerated: ${stats.uncoveredOperations} uncovered / ` +
        `${stats.parityOperations} parity operations (${stats.coveredOperations} covered).`,
    );
    return;
  }

  const baseline = JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8'),
  ) as IMcpParityBaseline;
  const baselineOperationIds = new Set(
    baseline.operations
      .map((operation) => operation.operationId)
      .filter(
        (operationId): operationId is string => operationId !== undefined,
      ),
  );

  const report = computeMcpParityReport({
    baselineOperationIds,
    coverage: coverageMap.coverage,
    internalRoutes: allowlist.internalRoutes,
    mcpToolNames,
    operations,
  });

  // Baseline entries are keyed on operationId; catch stored method/path that
  // drifted from the spec so the reviewed ledger cannot silently rot (#1251).
  const metadataDrift = findBaselineMetadataDrift(
    baseline.operations,
    report.uncovered,
  );
  const violations = [...report.violations, ...metadataDrift];

  const { stats } = report;
  console.info(
    `API↔MCP parity: ${stats.parityOperations} parity operations, ` +
      `${stats.coveredOperations} covered, ${stats.uncoveredOperations} uncovered ` +
      `(${stats.baselinedOperations} baselined), ${mcpToolNames.size} MCP tools.`,
  );

  if (violations.length === 0) {
    console.info('Parity gate passed.');
    return;
  }

  console.error(
    `\nAPI↔MCP parity gate FAILED (${violations.length} violation(s)):`,
  );
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  console.error(
    '\nEach uncovered operation must be one of: reachable via a coverage-map ' +
      'entry in src/config/openapi-mcp-coverage.json, allowlisted in ' +
      'src/config/openapi-internal-routes.json (internal route), or ' +
      'acknowledged in src/config/openapi-parity-baseline.json (regenerate ' +
      'with `bun run --filter=@genfeedai/api mcp:parity:update`).',
  );
  process.exit(1);
}

main();
