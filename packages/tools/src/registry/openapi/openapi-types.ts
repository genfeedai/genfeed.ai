/**
 * Minimal structural types for the slice of an OpenAPI 3 document the MCP tool
 * generator reads (#1248). Deliberately local to `@genfeedai/tools` so the
 * shared package never depends on `@nestjs/swagger` or the API app — the
 * generator consumes the committed `apps/server/api/openapi/openapi.json`
 * artifact (Phase 1 / #1247) as plain JSON.
 *
 * Only the fields the generator actually uses are typed; the open index
 * signature on {@link IOpenApiSchema} preserves every other JSON Schema keyword
 * (`format`, `default`, `minimum`, `example`, …) without resorting to `any`.
 */

/**
 * A JSON Schema node as it appears in an OpenAPI document. Known keywords are
 * typed; the index signature carries everything else verbatim.
 */
export interface IOpenApiSchema {
  $ref?: string;
  type?: string;
  description?: string;
  properties?: Record<string, IOpenApiSchema>;
  required?: string[];
  items?: IOpenApiSchema | IOpenApiSchema[];
  allOf?: IOpenApiSchema[];
  oneOf?: IOpenApiSchema[];
  anyOf?: IOpenApiSchema[];
  enum?: unknown[];
  [keyword: string]: unknown;
}

/**
 * A single `parameters[]` entry (path / query / header / cookie).
 */
export interface IOpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: IOpenApiSchema;
}

/**
 * The `requestBody` of an operation. Only the JSON media type is consulted.
 */
export interface IOpenApiRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: IOpenApiSchema }>;
}

/**
 * A single operation object (the value under a method key of a path item).
 */
export interface IOpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: IOpenApiParameter[];
  requestBody?: IOpenApiRequestBody;
}

/**
 * A path item — a partial map of lowercase HTTP method to operation.
 */
export type IOpenApiPathItem = Partial<Record<string, IOpenApiOperation>>;

/**
 * The subset of the OpenAPI document the generator reads.
 */
export interface IOpenApiDocument {
  paths?: Record<string, IOpenApiPathItem>;
  components?: {
    schemas?: Record<string, IOpenApiSchema>;
  };
}
