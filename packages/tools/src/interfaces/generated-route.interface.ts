/**
 * Route-binding contract for OpenAPI-generated MCP tools (#1246 parity epic).
 *
 * The generator (`scripts/generate-openapi-tools.ts`) emits one
 * {@link GeneratedRoute} per exposed API operation alongside the tool
 * definition. The MCP generic dispatcher consumes this manifest to turn a flat
 * tool-arg object back into a concrete HTTP call — path substitution, query
 * string, and request body — with no per-endpoint handler.
 *
 * `pathParams`, `queryParams`, and `bodyParams` are guaranteed disjoint by the
 * generator, so every incoming arg maps to exactly one request location.
 */

export type GeneratedHttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * How the request body is assembled from the tool's flat args:
 * - `none` — no body (GET, DELETE without a body, bodyless POST).
 * - `flat` — body is `pick(args, bodyParams)`; each DTO property is a top-level
 *   tool arg (the common, ergonomic case for object DTOs).
 * - `raw`  — body is `args.body` verbatim; used when the request schema is not a
 *   flat object (arrays, `allOf`/`oneOf`, primitives) and cannot be flattened.
 */
export type GeneratedBodyMode = 'none' | 'flat' | 'raw';

export interface GeneratedRoute {
  /** OpenAPI operationId, e.g. `"ActivitiesController.update"`. */
  operationId: string;
  /** HTTP method, lowercased. */
  method: GeneratedHttpMethod;
  /** URL template with `{param}` placeholders, e.g. `"/activities/{activityId}"`. */
  path: string;
  /** Path-parameter names (all required), in URL order. */
  pathParams: string[];
  /** Query-parameter names. */
  queryParams: string[];
  /** How to build the request body from args. */
  bodyMode: GeneratedBodyMode;
  /** Top-level body property names — populated only when `bodyMode === 'flat'`. */
  bodyParams: string[];
  /**
   * Read (GET) vs write (POST/PATCH/PUT/DELETE). Drives approval gating: writes
   * are routed through the existing MCP approval gate by the dispatcher.
   */
  isWrite: boolean;
}

/** Manifest keyed by generated MCP tool name (e.g. `"api_activities_update"`). */
export type GeneratedRouteManifest = Record<string, GeneratedRoute>;
