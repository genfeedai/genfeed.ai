import type {
  IMcpParityReport,
  IMcpToolCoverageEntry,
  IOpenApiInternalRoute,
  IOpenApiOperationRef,
} from '@api/shared/interfaces/openapi/openapi-spec.interface';
import { isInternalRoute } from './openapi-spec-validation.util';

/**
 * API↔MCP parity contract (#1246/#1251).
 *
 * Parity is a *reachability* invariant, not a 1:1 endpoint mirror: every
 * non-internal API operation must be reachable through some MCP tool, but a
 * single ergonomic capability tool (e.g. `manage_brand`) may cover many
 * operations. The link between an operation and the tool that reaches it is
 * declared explicitly in the coverage map (config/openapi-mcp-coverage.json),
 * keyed on the operationId (`<ControllerClass>.<method>`, unique per #1247).
 * This deliberately avoids generating one tool per endpoint, which would
 * produce ~1k tools and degrade agent tool-selection.
 *
 * This module is pure and JSON-only so it runs both inside the API (tests) and
 * from the standalone `scripts/check-mcp-parity.ts` gate without booting Nest.
 */

function operationKey(operation: IOpenApiOperationRef): string {
  return `${operation.method.toUpperCase()} ${operation.path}`;
}

/**
 * Detects baseline entries whose stored method/path no longer match the spec's
 * current operation for that operationId. The baseline is keyed on operationId,
 * so a route that moves (`GET /foo` → `POST /bar`) under a stable operationId
 * stays correctly acknowledged, but its ledger metadata silently rots. Flagging
 * the drift forces a regeneration so the reviewed ledger stays honest (#1251).
 * Entries whose operationId is no longer uncovered are ignored here — those are
 * reported as stale-baseline by {@link computeMcpParityReport}.
 */
export function findBaselineMetadataDrift(
  baseline: readonly IOpenApiOperationRef[],
  uncovered: readonly IOpenApiOperationRef[],
): string[] {
  const currentByOperationId = new Map<string, IOpenApiOperationRef>();
  for (const operation of uncovered) {
    if (operation.operationId !== undefined) {
      currentByOperationId.set(operation.operationId, operation);
    }
  }

  const drift: string[] = [];
  for (const entry of baseline) {
    if (entry.operationId === undefined) {
      continue;
    }
    const current = currentByOperationId.get(entry.operationId);
    if (current === undefined) {
      continue;
    }
    if (current.method !== entry.method || current.path !== entry.path) {
      drift.push(
        `Baseline metadata drift for "${entry.operationId}": ledger has ` +
          `${entry.method.toUpperCase()} ${entry.path}, spec has ` +
          `${operationKey(current)} — regenerate with: ` +
          'bun run --filter=@genfeedai/api mcp:parity:update',
      );
    }
  }

  return drift.sort();
}

/**
 * Computes API↔MCP parity for a document's operations against the reviewed
 * coverage map + baseline ledger.
 *
 * Coverage: a parity operation is covered when its operationId is declared in
 * the coverage map by a tool that actually exists in the MCP surface.
 *
 * Gate outcome (violations non-empty ⇒ CI fails):
 *  - `unexpected`  — uncovered operations NOT in the baseline (a new endpoint
 *    that no tool reaches and that has not been acknowledged).
 *  - `staleBaseline` — baseline operationIds that are no longer uncovered
 *    (now covered, now allowlisted, or removed from the spec) and must be
 *    dropped from the ledger so it cannot rot.
 *  - a coverage-map entry naming a tool absent from the MCP surface, or an
 *    operationId that is unknown or internal (phantom coverage).
 *  - a parity operation missing an operationId (should be impossible after
 *    #1247, guarded here defensively).
 */
export function computeMcpParityReport(params: {
  operations: IOpenApiOperationRef[];
  internalRoutes: IOpenApiInternalRoute[];
  coverage: readonly IMcpToolCoverageEntry[];
  mcpToolNames: ReadonlySet<string>;
  baselineOperationIds: ReadonlySet<string>;
}): IMcpParityReport {
  const {
    operations,
    internalRoutes,
    coverage,
    mcpToolNames,
    baselineOperationIds,
  } = params;
  const violations: string[] = [];

  const parityOperations = operations.filter(
    (operation) => !isInternalRoute(operation.path, internalRoutes),
  );

  // Defensive: parity requires an operationId as the coverage/baseline key.
  // #1247's emit gate guarantees presence, but a stale artifact must fail loud.
  const missingOperationId = parityOperations.filter(
    (operation) => operation.operationId === undefined,
  );
  for (const operation of missingOperationId) {
    violations.push(`Missing operationId: ${operationKey(operation)}`);
  }

  const identified = parityOperations.filter(
    (operation): operation is IOpenApiOperationRef & { operationId: string } =>
      operation.operationId !== undefined,
  );
  const parityOperationIds = new Set(identified.map((o) => o.operationId));

  // Validate the coverage map so it cannot claim phantom coverage: every entry
  // must name a real MCP tool and only real, non-internal operationIds.
  const coveredOperationIds = new Set<string>();
  for (const entry of coverage) {
    if (!mcpToolNames.has(entry.tool)) {
      // Phantom tool: its coverage claims are void — do not credit them.
      violations.push(
        `Coverage map references unknown MCP tool "${entry.tool}" — it is not ` +
          "in getToolsForSurface('mcp').",
      );
      continue;
    }
    for (const operationId of entry.operationIds) {
      if (!parityOperationIds.has(operationId)) {
        violations.push(
          `Coverage map entry for tool "${entry.tool}" references unknown or ` +
            `internal operationId "${operationId}".`,
        );
        continue;
      }
      coveredOperationIds.add(operationId);
    }
  }

  const covered: IOpenApiOperationRef[] = [];
  const uncovered: IOpenApiOperationRef[] = [];
  for (const operation of identified) {
    if (coveredOperationIds.has(operation.operationId)) {
      covered.push(operation);
    } else {
      uncovered.push(operation);
    }
  }

  const uncoveredIds = new Set(uncovered.map((o) => o.operationId));

  // A new gap: uncovered and not acknowledged in the baseline.
  const unexpected = uncovered.filter(
    (operation) => !baselineOperationIds.has(operation.operationId as string),
  );
  for (const operation of unexpected) {
    violations.push(
      `Unreachable API operation — no MCP tool covers ${operationKey(operation)} ` +
        `(operationId "${operation.operationId}"). Make it reachable via a ` +
        'coverage-map entry (config/openapi-mcp-coverage.json), allowlist the ' +
        'route as internal, or acknowledge it in the parity baseline.',
    );
  }

  // A rotted ledger: baseline entry no longer uncovered. Forces ratchet-down.
  const staleBaseline: string[] = [];
  for (const operationId of baselineOperationIds) {
    if (!uncoveredIds.has(operationId)) {
      staleBaseline.push(operationId);
    }
  }
  staleBaseline.sort();
  for (const operationId of staleBaseline) {
    violations.push(
      `Stale parity-baseline entry "${operationId}" is now covered, ` +
        'allowlisted, or removed — regenerate the baseline with: ' +
        'bun run --filter=@genfeedai/api mcp:parity:update',
    );
  }

  const baselinedCount = uncovered.length - unexpected.length;

  return {
    stats: {
      baselinedOperations: baselinedCount,
      coveredOperations: covered.length,
      parityOperations: parityOperations.length,
      staleBaselineEntries: staleBaseline.length,
      uncoveredOperations: uncovered.length,
      unexpectedOperations: unexpected.length,
    },
    staleBaseline,
    uncovered,
    unexpected,
    violations,
  };
}
