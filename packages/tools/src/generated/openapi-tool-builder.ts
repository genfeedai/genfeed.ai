/**
 * Pure OpenAPI-operation → MCP-tool transform (#1248, parity epic #1246).
 *
 * Kept free of filesystem/IO so it is unit-testable and reusable. The CLI
 * runner (`scripts/generate-openapi-tools.ts`) reads the spec, calls
 * {@link buildOperation} per operation, and serializes the result; the CI parity
 * gate (#1251) can reuse {@link deriveToolName} to map operations → tool names.
 */

import type {
  GeneratedBodyMode,
  GeneratedHttpMethod,
  GeneratedRoute,
} from '../interfaces/generated-route.interface.js';
import type { SourceTool } from '../interfaces/source-tool.interface.js';

// ── Minimal typed view of the slice of OpenAPI 3 we read ──────────────────────

export interface JsonSchema {
  $ref?: string;
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: JsonSchema }>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
}

export const HTTP_METHODS: readonly GeneratedHttpMethod[] = [
  'get',
  'post',
  'patch',
  'put',
  'delete',
];

export interface BuiltOperation {
  tool: SourceTool;
  route: GeneratedRoute;
}

const MAX_TOOL_NAME_LENGTH = 64;

/** camelCase / PascalCase / kebab → snake_case, collapsing non-alnum runs. */
export function toSnake(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/** Deterministic short hash for disambiguating over-long names. */
function shortHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

/** `"ActivitiesController.update"` → `"api_activities_update"`. */
export function deriveToolName(operationId: string): string {
  const [rawController, ...rest] = operationId.split('.');
  const method = rest.join('_') || 'operation';
  const controller = rawController.replace(/Controller$/, '');
  const base = `api_${toSnake(controller)}_${toSnake(method)}`.replace(
    /_+/g,
    '_',
  );
  if (base.length <= MAX_TOOL_NAME_LENGTH) return base;
  // Preserve a readable prefix, keep uniqueness via an operationId-derived hash.
  return `${base.slice(0, MAX_TOOL_NAME_LENGTH - 7)}_${shortHash(operationId)}`;
}

/** Resolve a one-level `#/components/schemas/Name` ref; undefined if unresolved. */
export function resolveRef(
  schema: JsonSchema | undefined,
  schemas: Record<string, JsonSchema>,
): JsonSchema | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;
  const name = schema.$ref.split('/').pop();
  return name ? schemas[name] : undefined;
}

/**
 * Reduce a property schema to a bounded, valid JSON-Schema fragment for the tool
 * input. Nested `$ref`s become a generic object — tool inputs stay shallow and
 * predictable for agents (we never recurse).
 */
export function simplifyPropertySchema(
  schema: JsonSchema,
): Record<string, unknown> {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() ?? 'object';
    return { description: `Object (${refName})`, type: 'object' };
  }
  const out: Record<string, unknown> = {};
  out.type = schema.type ?? 'string';
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.type === 'array') {
    const items = schema.items;
    out.items =
      items && !items.$ref
        ? { type: items.type ?? 'string' }
        : { type: 'object' };
  }
  return out;
}

/**
 * Transform a single OpenAPI operation into an MCP {@link SourceTool} plus its
 * {@link GeneratedRoute} binding metadata. `op.operationId` MUST be present
 * (the emitter guarantees this via `stableOperationIdFactory`).
 */
export function buildOperation(
  path: string,
  method: GeneratedHttpMethod,
  op: OpenApiOperation,
  schemas: Record<string, JsonSchema>,
): BuiltOperation {
  const operationId = op.operationId as string;
  const name = deriveToolName(operationId);

  const params = op.parameters ?? [];
  const pathParamDefs = params.filter((p) => p.in === 'path');
  const queryParamDefs = params.filter((p) => p.in === 'query');
  const pathParams = pathParamDefs.map((p) => p.name);
  const queryParams = queryParamDefs.map((p) => p.name);

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const p of pathParamDefs) {
    properties[p.name] = {
      description: p.description ?? `Path parameter: ${p.name}`,
      type: p.schema?.type ?? 'string',
    };
    required.push(p.name);
  }
  for (const p of queryParamDefs) {
    if (properties[p.name]) continue; // path wins on the rare name clash
    properties[p.name] = {
      description: p.description ?? `Query parameter: ${p.name}`,
      type: p.schema?.type ?? 'string',
    };
    if (p.required) required.push(p.name);
  }

  // ── Body binding ──
  let bodyMode: GeneratedBodyMode = 'none';
  const bodyParams: string[] = [];
  const jsonSchema = op.requestBody?.content?.['application/json']?.schema;
  if (jsonSchema) {
    const resolved = resolveRef(jsonSchema, schemas);
    const isFlatObject =
      resolved?.type === 'object' &&
      resolved.properties &&
      Object.keys(resolved.properties).length > 0 &&
      !resolved.allOf &&
      !resolved.oneOf &&
      !resolved.anyOf;

    if (isFlatObject && resolved?.properties) {
      bodyMode = 'flat';
      const bodyRequired = new Set(resolved.required ?? []);
      for (const [propName, propSchema] of Object.entries(
        resolved.properties,
      )) {
        // Keep locations disjoint: a body prop shadowed by a path/query param is
        // dropped from the body binding (the param value is authoritative).
        if (properties[propName]) continue;
        properties[propName] = simplifyPropertySchema(propSchema);
        bodyParams.push(propName);
        if (bodyRequired.has(propName)) required.push(propName);
      }
      if (bodyParams.length === 0) bodyMode = 'raw';
    } else {
      bodyMode = 'raw';
    }

    if (bodyMode === 'raw' && !properties.body) {
      properties.body = {
        description: 'Request body payload for this operation.',
        type: 'object',
      };
      if (op.requestBody?.required) required.push('body');
    }
  }

  const isWrite = method !== 'get';
  const description =
    op.summary?.trim() ||
    op.description?.trim()?.split('\n')[0] ||
    `${method.toUpperCase()} ${path}`;

  const tool: SourceTool = {
    creditCost: 0,
    description: `[API] ${description}`,
    name,
    parameters: {
      properties,
      ...(required.length > 0 ? { required: [...new Set(required)] } : {}),
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  };

  const route: GeneratedRoute = {
    bodyMode,
    bodyParams,
    isWrite,
    method,
    operationId,
    path,
    pathParams,
    queryParams,
  };

  return { route, tool };
}
