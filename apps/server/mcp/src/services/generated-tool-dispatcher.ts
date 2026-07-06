import {
  type CanonicalToolDefinition,
  GENERATED_MCP_OPERATIONS,
  type IGeneratedMcpOperationBinding,
} from '@genfeedai/tools';
import type { GeneratedApiRequest } from '@mcp/services/client/client.types';

const GENERATED_OPERATIONS_BY_TOOL = new Map<
  string,
  IGeneratedMcpOperationBinding
>(GENERATED_MCP_OPERATIONS.map((operation) => [operation.toolName, operation]));

const GENERATED_WRITE_METHODS: ReadonlySet<string> = new Set([
  'delete',
  'patch',
  'post',
  'put',
]);

type QueryPrimitive = boolean | number | string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key);
}

function formatNames(names: Iterable<string>): string {
  const sorted = [...names].sort();
  return sorted.length > 0 ? sorted.join(', ') : '(none)';
}

function isMissingRequired(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isQueryPrimitive(value: unknown): value is QueryPrimitive {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  );
}

function toPathSegment(name: string, value: unknown): string {
  if (isMissingRequired(value)) {
    throw new Error(`Missing required path argument "${name}".`);
  }
  if (!isQueryPrimitive(value)) {
    throw new Error(
      `Path argument "${name}" must be a string, number, or boolean.`,
    );
  }
  return encodeURIComponent(String(value));
}

function toQueryValue(name: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.every(isQueryPrimitive)) {
      return value;
    }
    throw new Error(
      `Query argument "${name}" must contain only strings, numbers, or booleans.`,
    );
  }
  if (isQueryPrimitive(value)) {
    return value;
  }
  throw new Error(`Query argument "${name}" must be a scalar or scalar array.`);
}

export function getGeneratedOperationBinding(
  toolName: string,
): IGeneratedMcpOperationBinding | undefined {
  return GENERATED_OPERATIONS_BY_TOOL.get(toolName);
}

export function isGeneratedWriteOperation(
  operation: IGeneratedMcpOperationBinding,
): boolean {
  return GENERATED_WRITE_METHODS.has(operation.method);
}

export function bindGeneratedOperationRequest(
  operation: IGeneratedMcpOperationBinding,
  tool: CanonicalToolDefinition,
  args: unknown,
): GeneratedApiRequest {
  if (tool.name !== operation.toolName) {
    throw new Error(
      `Generated tool metadata mismatch: "${tool.name}" does not match "${operation.toolName}".`,
    );
  }
  if (!isRecord(args)) {
    throw new Error(
      `Arguments for generated tool "${tool.name}" must be an object.`,
    );
  }

  const allowedNames = new Set(Object.keys(tool.parameters.properties));
  const unknownNames = Object.keys(args).filter(
    (name) => !allowedNames.has(name),
  );
  if (unknownNames.length > 0) {
    throw new Error(
      `Unknown argument(s) for generated tool "${tool.name}": ${formatNames(
        unknownNames,
      )}. Allowed arguments: ${formatNames(allowedNames)}.`,
    );
  }

  const requiredNames = new Set(tool.parameters.required ?? []);
  for (const name of requiredNames) {
    if (isMissingRequired(args[name])) {
      throw new Error(
        `Missing required argument "${name}" for generated tool "${tool.name}".`,
      );
    }
  }

  const pathParamNames = new Set(operation.pathParams);
  const queryParamNames = new Set(operation.queryParams);
  const path = operation.path.replace(/\{([^}]+)\}/g, (_match, rawName) => {
    const name = String(rawName);
    pathParamNames.add(name);
    return toPathSegment(name, args[name]);
  });

  const query: Record<string, unknown> = {};
  for (const name of queryParamNames) {
    const value = args[name];
    if (value !== undefined && value !== null) {
      query[name] = toQueryValue(name, value);
    }
  }

  let body: unknown;
  if (operation.bodyStyle === 'body') {
    if (hasOwn(args, 'body')) {
      body = args.body;
    }
  } else if (operation.bodyStyle === 'properties') {
    const payload: Record<string, unknown> = {};
    for (const name of operation.bodyFields) {
      if (hasOwn(args, name)) {
        payload[name] = args[name];
      }
    }
    if (Object.keys(payload).length > 0 || operation.bodyRequired) {
      body = payload;
    }
  }

  return {
    body,
    method: operation.method.toUpperCase(),
    operationLabel: `${operation.method.toUpperCase()} ${operation.path} (${operation.toolName})`,
    path,
    query,
  };
}
