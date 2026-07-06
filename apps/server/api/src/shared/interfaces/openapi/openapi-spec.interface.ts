/**
 * Interfaces for the deterministic OpenAPI emit + validation pipeline (#1247).
 * The generated document is the single source of truth for MCP tool
 * generation (#1246), so operation identity and allowlist entries are typed
 * here and shared by the runtime builder, the emit gate, and the validation
 * script.
 */

/**
 * A single exposed operation extracted from an OpenAPI document.
 */
export interface IOpenApiOperationRef {
  /**
   * Lowercase HTTP method (get, post, patch, put, delete, options, head, trace)
   */
  method: string;

  /**
   * Stable unique operation id (controllerClassName.methodName)
   */
  operationId?: string;

  /**
   * Document path key, e.g. /v1/brands/{brandId}
   */
  path: string;
}

/**
 * One internal-route allowlist entry — a route excluded from API↔MCP parity
 * (health probes, inbound provider webhooks, docs/meta endpoints).
 */
export interface IOpenApiInternalRoute {
  /**
   * Path prefix matched against document path keys, e.g. /v1/webhooks/
   */
  pathPrefix: string;

  /**
   * Why the route is internal-only
   */
  reason: string;
}

/**
 * Shape of config/openapi-internal-routes.json
 */
export interface IOpenApiInternalRouteAllowlist {
  description: string;
  internalRoutes: IOpenApiInternalRoute[];
}

/**
 * Result of validating a generated OpenAPI document.
 */
export interface IOpenApiSpecValidationResult {
  /**
   * Aggregate counts for reporting
   */
  stats: {
    internalOperations: number;
    parityOperations: number;
    totalOperations: number;
    uniqueOperationIds: number;
  };

  /**
   * Human-readable violation messages; empty means the document is valid
   */
  violations: string[];
}

/**
 * One coverage-map entry: a capability MCP tool and the API operationIds it
 * makes reachable (#1246/#1251). Parity is a *reachability* contract, not a
 * 1:1 endpoint mirror — a single ergonomic tool (e.g. `manage_brand`) can
 * cover several operations. Declaring coverage here is how curation shrinks
 * the parity baseline. The generic dispatcher (#1249) and per-tool metadata
 * (#1252) will populate this; for now it is the single source of the link
 * between an operation and the tool that reaches it.
 */
export interface IMcpToolCoverageEntry {
  /**
   * Canonical MCP tool name (must exist in getToolsForSurface('mcp'))
   */
  tool: string;

  /**
   * operationIds this tool makes reachable (each must be a real, non-internal
   * operation in the spec)
   */
  operationIds: string[];
}

/**
 * Shape of config/openapi-mcp-coverage.json — the reviewed map of which
 * capability MCP tools reach which API operations. Empty until curated tools
 * are linked; the gate validates every entry against the spec + MCP tool set
 * so the map cannot claim phantom coverage.
 */
export interface IMcpToolCoverageMap {
  description: string;
  coverage: IMcpToolCoverageEntry[];
}

/**
 * Shape of config/openapi-parity-baseline.json — the reviewed ledger of
 * parity-relevant operations that are NOT yet reachable via any capability
 * MCP tool (#1251). This is the acknowledged parity debt: until curated tools
 * (#1252) / the dispatcher (#1249) declare coverage, ~all non-internal
 * operations start unreachable. The gate fails on any uncovered operation NOT
 * in this baseline (a NEW gap), and on any baseline entry that is no longer
 * uncovered (a stale entry that must be removed as coverage lands). The ledger
 * only ratchets down; it never grows silently.
 */
export interface IMcpParityBaseline {
  description: string;

  /**
   * Sorted list of operations acknowledged as not-yet-reachable via an MCP
   * tool. Keyed on operationId; method/path are carried for review readability.
   */
  operations: IOpenApiOperationRef[];
}

/**
 * Result of computing API↔MCP parity for a document + coverage map + baseline.
 */
export interface IMcpParityReport {
  stats: {
    /** Non-internal operations subject to the parity contract */
    parityOperations: number;

    /** Parity operations reachable via a declared coverage-map entry */
    coveredOperations: number;

    /** Parity operations not reachable via any MCP tool */
    uncoveredOperations: number;

    /** Uncovered operations acknowledged in the baseline ledger */
    baselinedOperations: number;

    /** Uncovered operations NOT in the baseline — build-failing gaps */
    unexpectedOperations: number;

    /** Baseline entries no longer uncovered — build-failing stale entries */
    staleBaselineEntries: number;
  };

  /**
   * Uncovered parity operations that are not in the baseline. Non-empty means
   * a new endpoint shipped without an MCP tool: the gate fails.
   */
  unexpected: IOpenApiOperationRef[];

  /**
   * Baseline operationIds that are now covered, allowlisted, or no longer
   * present in the spec. Non-empty means the ledger drifted and must be
   * regenerated: the gate fails so the baseline cannot rot.
   */
  staleBaseline: string[];

  /**
   * Every uncovered parity operation (baselined + unexpected), for reporting.
   */
  uncovered: IOpenApiOperationRef[];

  /**
   * Human-readable violation messages; empty means parity holds.
   */
  violations: string[];
}
