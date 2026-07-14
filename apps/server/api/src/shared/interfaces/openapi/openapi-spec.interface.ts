/**
 * Interfaces for the deterministic OpenAPI emit + validation pipeline (#1247).
 * Operation identity and internal-route classification are shared by the
 * runtime builder, the emit gate, and the validation script. OpenAPI documents
 * HTTP APIs; it does not define Agent or MCP actions.
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
 * One internal-route classification entry (health probes, inbound provider
 * webhooks, docs/meta endpoints).
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
    publicOperations: number;
    totalOperations: number;
    uniqueOperationIds: number;
  };

  /**
   * Human-readable violation messages; empty means the document is valid
   */
  violations: string[];
}
