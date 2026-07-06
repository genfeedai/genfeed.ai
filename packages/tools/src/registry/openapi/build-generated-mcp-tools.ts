/**
 * Build-time generator core (#1248): maps every non-internal OpenAPI operation
 * to a canonical MCP tool definition. Pure and dependency-free so it can run
 * inside the generator script, the unit tests, and (later) the parity gate
 * without booting Nest or touching the filesystem.
 *
 * Design decisions:
 *  - **Name** derives from the stable operationId Phase 1 guarantees
 *    (`<Controller>.<method>`) as `<domain>__<action>`. The `__` domain
 *    separator is never used by hand-authored tools, so it doubles as the
 *    dispatcher's "this is a generated tool" marker (see the MCP `classify`).
 *  - **Input schema** flattens path + query parameters and the request-body
 *    object's properties into one flat `properties` map, mirroring the
 *    hand-authored MCP tools (which take flat args). `$ref`s are dereferenced
 *    against `components.schemas` with a per-branch cycle guard so each tool's
 *    schema is self-contained valid JSON Schema.
 *  - **Surfaces** are mcp-only; dispatch/execution and approval-gating are
 *    explicitly out of scope (#1249 / #1250).
 */

import type {
  CanonicalToolDefinition,
  ToolParameterSchema,
} from '../../interfaces/tool-definition.interface.js';
import type {
  IOpenApiDocument,
  IOpenApiOperation,
  IOpenApiSchema,
} from './openapi-types.js';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
] as const;

const REF_PREFIX = '#/components/schemas/';

export type GeneratedMcpHttpMethod = (typeof HTTP_METHODS)[number];

export type GeneratedMcpBodyStyle = 'none' | 'properties' | 'body';

/**
 * A single exposed operation paired with the metadata the generator (and, in a
 * later phase, the dispatcher) needs. Exported so #1249 can rebuild the
 * tool-name → operation binding from the same source with the same derivation.
 */
export interface IGeneratedOperation {
  toolName: string;
  domain: string;
  method: GeneratedMcpHttpMethod;
  path: string;
  operationId: string;
  operation: IOpenApiOperation;
}

/**
 * Runtime dispatch metadata emitted alongside the generated MCP tool catalog.
 * The canonical tool definition intentionally stays surface-oriented; this
 * sidecar preserves the OpenAPI execution binding without requiring the MCP
 * service to import the API app's OpenAPI document at runtime.
 */
export interface IGeneratedMcpOperationBinding {
  toolName: string;
  method: GeneratedMcpHttpMethod;
  path: string;
  operationId: string;
  pathParams: string[];
  queryParams: string[];
  bodyRequired: boolean;
  bodyFields: string[];
  bodyStyle: GeneratedMcpBodyStyle;
}

/**
 * Converts a camelCase / PascalCase identifier to snake_case, keeping acronyms
 * readable (`getHTMLData` → `get_html_data`, `oauth2Callback` →
 * `oauth2_callback`). Deterministic and lossless enough that distinct
 * identifiers stay distinct.
 */
export function toSnakeCase(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Splits a `<Controller>.<method>` operationId into its snake_cased domain and
 * action. The controller's `Controller` suffix is dropped. Operations without a
 * `.` (should not occur given the Phase 1 factory) fall back to the `api`
 * domain so the derived name always carries the `__` marker.
 */
export function splitOperationId(operationId: string): {
  domain: string;
  action: string;
} {
  const dot = operationId.indexOf('.');
  if (dot === -1) {
    return { action: toSnakeCase(operationId) || 'operation', domain: 'api' };
  }

  const controller = operationId.slice(0, dot);
  const method = operationId.slice(dot + 1);
  const controllerBase = controller.endsWith('Controller')
    ? controller.slice(0, -'Controller'.length)
    : controller;

  return {
    action: toSnakeCase(method) || 'operation',
    domain: toSnakeCase(controllerBase) || 'api',
  };
}

/**
 * Stable MCP tool name for an operationId: `<domain>__<action>`. Exported so the
 * dispatcher (#1249) derives the identical name from the same spec.
 */
export function deriveToolName(operationId: string): string {
  const { domain, action } = splitOperationId(operationId);
  return `${domain}__${action}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursively resolves `#/components/schemas/*` `$ref`s into self-contained
 * schemas. Cycles are broken per resolution branch — a schema that transitively
 * references itself is replaced with an opaque `{ type: 'object' }` node rather
 * than recursing forever. Sibling keys alongside a `$ref` (e.g. a `description`)
 * are preserved and overlaid on the resolved target.
 */
export function dereferenceSchema(
  node: unknown,
  components: Record<string, IOpenApiSchema>,
  seen: ReadonlySet<string> = new Set<string>(),
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => dereferenceSchema(item, components, seen));
  }

  if (!isRecord(node)) {
    return node;
  }

  const ref = node.$ref;
  if (typeof ref === 'string' && ref.startsWith(REF_PREFIX)) {
    const name = ref.slice(REF_PREFIX.length);
    if (seen.has(name)) {
      return { description: `Circular reference to ${name}`, type: 'object' };
    }
    const target = components[name];
    if (!target) {
      return { type: 'object' };
    }
    const nextSeen = new Set<string>(seen).add(name);
    const resolved = dereferenceSchema(target, components, nextSeen);
    const siblings: Record<string, unknown> = { ...node };
    delete siblings.$ref;
    const resolvedSiblings = dereferenceSchema(siblings, components, seen);
    return {
      ...(isRecord(resolved) ? resolved : {}),
      ...(isRecord(resolvedSiblings) ? resolvedSiblings : {}),
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = dereferenceSchema(value, components, seen);
  }
  return out;
}

function withDescription(
  schema: unknown,
  description: string | undefined,
): unknown {
  if (!description) {
    return schema;
  }
  if (isRecord(schema) && typeof schema.description === 'string') {
    return schema;
  }
  return { description, ...(isRecord(schema) ? schema : {}) };
}

/**
 * A mechanical, non-prose description: the operation summary/description (or the
 * operationId as a last resort), suffixed with the concrete route so the ~40
 * distinct `findAll`s stay distinguishable. Ergonomic descriptions are a later
 * phase (#1252), so nothing here is hand-tuned per tool.
 */
function buildDescription(
  operation: IOpenApiOperation,
  method: string,
  path: string,
  operationId: string,
): string {
  const base =
    operation.summary?.trim() || operation.description?.trim() || operationId;
  return `${base} (${method.toUpperCase()} ${path})`;
}

/**
 * Flattens path + query parameters and the request body into one JSON Schema.
 * Path/query params that repeat (a name declared in both `path` and `query`)
 * collapse to a single property and stay required if any occurrence is
 * required. A body property whose name clashes with a param name is a genuine
 * ambiguity and throws — the generator must fail loudly rather than silently
 * drop an argument.
 */
export function buildInputSchema(
  operation: IOpenApiOperation,
  components: Record<string, IOpenApiSchema>,
): ToolParameterSchema {
  const properties = new Map<string, unknown>();
  const paramNames = new Set<string>();
  const required = new Set<string>();

  for (const parameter of operation.parameters ?? []) {
    if (parameter.in !== 'path' && parameter.in !== 'query') {
      continue;
    }
    const resolved = dereferenceSchema(
      parameter.schema ?? { type: 'string' },
      components,
    );
    properties.set(
      parameter.name,
      withDescription(resolved, parameter.description),
    );
    paramNames.add(parameter.name);
    if (parameter.required === true) {
      required.add(parameter.name);
    }
  }

  const requestBody = operation.requestBody;
  const bodySchemaRaw = requestBody?.content?.['application/json']?.schema;
  if (bodySchemaRaw) {
    const body = dereferenceSchema(bodySchemaRaw, components);
    const bodyRequired = requestBody?.required === true;

    if (isRecord(body) && isRecord(body.properties)) {
      const bodyRequiredNames = new Set<string>(
        Array.isArray(body.required)
          ? body.required.filter(
              (name): name is string => typeof name === 'string',
            )
          : [],
      );
      for (const [key, value] of Object.entries(body.properties)) {
        if (paramNames.has(key)) {
          throw new Error(
            `Generated tool for "${operation.operationId}" has a body property "${key}" that collides with a path/query parameter.`,
          );
        }
        properties.set(key, value);
        if (bodyRequired && bodyRequiredNames.has(key)) {
          required.add(key);
        }
      }
    } else {
      if (paramNames.has('body')) {
        throw new Error(
          `Generated tool for "${operation.operationId}" needs a "body" property but a parameter already claims that name.`,
        );
      }
      properties.set('body', body);
      if (bodyRequired) {
        required.add('body');
      }
    }
  }

  const sortedProperties: Record<string, unknown> = {};
  for (const key of [...properties.keys()].sort()) {
    sortedProperties[key] = properties.get(key);
  }

  const requiredList = [...required]
    .filter((name) => name in sortedProperties)
    .sort();

  const schema: ToolParameterSchema = {
    properties: sortedProperties,
    type: 'object',
  };
  if (requiredList.length > 0) {
    schema.required = requiredList;
  }
  return schema;
}

function isInternalPath(path: string, internalPrefixes: string[]): boolean {
  return internalPrefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * Enumerates every non-internal operation in the document, in a deterministic
 * (path, method) order.
 */
export function collectGeneratedOperations(
  document: IOpenApiDocument,
  internalPrefixes: string[],
): IGeneratedOperation[] {
  const paths = document.paths ?? {};
  const operations: IGeneratedOperation[] = [];

  for (const path of Object.keys(paths).sort()) {
    if (isInternalPath(path, internalPrefixes)) {
      continue;
    }
    const pathItem = paths[path];
    if (!isRecord(pathItem)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation.operationId !== 'string') {
        continue;
      }
      const { domain } = splitOperationId(operation.operationId);
      operations.push({
        domain,
        method,
        operation,
        operationId: operation.operationId,
        path,
        toolName: deriveToolName(operation.operationId),
      });
    }
  }

  return operations;
}

/**
 * Maps a single operation to its canonical MCP tool definition. Generated tools
 * are mcp-only, uncategorised (the domain lives in `tags` for navigability),
 * cost nothing to list, and default to the `user` role — actual authorization
 * is enforced by the API's own guards at dispatch time (#1299), which does not
 * exist yet.
 */
export function operationToToolDefinition(
  generated: IGeneratedOperation,
  components: Record<string, IOpenApiSchema>,
): CanonicalToolDefinition {
  return {
    category: 'other',
    creditCost: 0,
    description: buildDescription(
      generated.operation,
      generated.method,
      generated.path,
      generated.operationId,
    ),
    name: generated.toolName,
    parameters: buildInputSchema(generated.operation, components),
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
    tags: [generated.domain],
  };
}

function buildBodyBinding(
  generated: IGeneratedOperation,
  components: Record<string, IOpenApiSchema>,
  paramNames: ReadonlySet<string>,
): Pick<
  IGeneratedMcpOperationBinding,
  'bodyFields' | 'bodyRequired' | 'bodyStyle'
> {
  const requestBody = generated.operation.requestBody;
  const bodyRequired = requestBody?.required === true;
  const bodySchemaRaw = requestBody?.content?.['application/json']?.schema;
  if (!bodySchemaRaw) {
    return { bodyFields: [], bodyRequired: false, bodyStyle: 'none' };
  }

  const body = dereferenceSchema(bodySchemaRaw, components);
  if (isRecord(body) && isRecord(body.properties)) {
    const bodyFields = Object.keys(body.properties).sort();
    const collision = bodyFields.find((field) => paramNames.has(field));
    if (collision) {
      throw new Error(
        `Generated operation binding for "${generated.operationId}" has a body property "${collision}" that collides with a path/query parameter.`,
      );
    }
    return { bodyFields, bodyRequired, bodyStyle: 'properties' };
  }

  if (paramNames.has('body')) {
    throw new Error(
      `Generated operation binding for "${generated.operationId}" needs a "body" property but a parameter already claims that name.`,
    );
  }
  return { bodyFields: ['body'], bodyRequired, bodyStyle: 'body' };
}

export function operationToGeneratedMcpOperationBinding(
  generated: IGeneratedOperation,
  components: Record<string, IOpenApiSchema>,
): IGeneratedMcpOperationBinding {
  const pathParams = new Set<string>();
  const queryParams = new Set<string>();

  for (const parameter of generated.operation.parameters ?? []) {
    if (parameter.in === 'path') {
      pathParams.add(parameter.name);
    }
    if (parameter.in === 'query') {
      queryParams.add(parameter.name);
    }
  }

  const paramNames = new Set<string>([...pathParams, ...queryParams]);
  const bodyBinding = buildBodyBinding(generated, components, paramNames);

  return {
    bodyFields: bodyBinding.bodyFields,
    bodyRequired: bodyBinding.bodyRequired,
    bodyStyle: bodyBinding.bodyStyle,
    method: generated.method,
    operationId: generated.operationId,
    path: generated.path,
    pathParams: [...pathParams].sort(),
    queryParams: [...queryParams].sort(),
    toolName: generated.toolName,
  };
}

/**
 * Builds the full, name-sorted list of generated MCP tool definitions from a
 * parsed OpenAPI document and the internal-route allowlist prefixes. Throws on a
 * derived-name collision so two operations can never silently map to one tool.
 * Deterministic: same inputs → structurally identical output.
 */
export function buildGeneratedMcpTools(
  document: IOpenApiDocument,
  internalPrefixes: string[],
): CanonicalToolDefinition[] {
  const components = document.components?.schemas ?? {};
  const operations = collectGeneratedOperations(document, internalPrefixes);

  const byName = new Map<string, IGeneratedOperation>();
  for (const generated of operations) {
    const existing = byName.get(generated.toolName);
    if (existing) {
      throw new Error(
        `Generated MCP tool name collision "${generated.toolName}": ` +
          `${existing.operationId} and ${generated.operationId}.`,
      );
    }
    byName.set(generated.toolName, generated);
  }

  return operations
    .map((generated) => operationToToolDefinition(generated, components))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function buildGeneratedMcpOperationBindings(
  document: IOpenApiDocument,
  internalPrefixes: string[],
): IGeneratedMcpOperationBinding[] {
  const components = document.components?.schemas ?? {};
  const operations = collectGeneratedOperations(document, internalPrefixes);

  const byName = new Map<string, IGeneratedOperation>();
  for (const generated of operations) {
    const existing = byName.get(generated.toolName);
    if (existing) {
      throw new Error(
        `Generated MCP operation binding collision "${generated.toolName}": ` +
          `${existing.operationId} and ${generated.operationId}.`,
      );
    }
    byName.set(generated.toolName, generated);
  }

  return operations
    .map((generated) =>
      operationToGeneratedMcpOperationBinding(generated, components),
    )
    .sort((a, b) =>
      a.toolName < b.toolName ? -1 : a.toolName > b.toolName ? 1 : 0,
    );
}
