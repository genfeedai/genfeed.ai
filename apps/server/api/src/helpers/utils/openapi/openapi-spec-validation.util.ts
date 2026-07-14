import type {
  IOpenApiInternalRoute,
  IOpenApiInternalRouteAllowlist,
  IOpenApiOperationRef,
  IOpenApiSpecValidationResult,
} from '@api/shared/interfaces/openapi/openapi-spec.interface';

const HTTP_METHODS = [
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
] as const;

/**
 * Extracts every operation (method + path + operationId) from an OpenAPI
 * document. Works on the plain-JSON artifact, so it is usable both inside the
 * API (emit gate, tests) and from standalone scripts without Nest.
 */
export function collectOperations(
  document: Record<string, unknown>,
): IOpenApiOperationRef[] {
  const paths = (document.paths ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const operations: IOpenApiOperationRef[] = [];

  for (const path of Object.keys(paths).sort()) {
    const pathItem = paths[path];
    if (pathItem === null || typeof pathItem !== 'object') {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === null || typeof operation !== 'object') {
        continue;
      }

      const { operationId } = operation as { operationId?: unknown };
      operations.push({
        method,
        operationId:
          typeof operationId === 'string' && operationId.length > 0
            ? operationId
            : undefined,
        path,
      });
    }
  }

  return operations;
}

/**
 * Whether `path` is covered by an internal-route prefix. Matching is
 * segment-aware to avoid over-matching: a prefix that does not already end in
 * `/` only matches the exact path or a path continuing at a `/` boundary. So
 * `/health` matches `/health` and `/health/live` but NOT a future public
 * `/healthcare` — which raw `startsWith` would have silently classified as
 * internal. Trailing-slash prefixes (`/webhooks/`) keep prefix semantics.
 */
export function isInternalRoute(
  path: string,
  internalRoutes: IOpenApiInternalRoute[],
): boolean {
  return internalRoutes.some((route) => {
    const prefix = route.pathPrefix;
    if (prefix.endsWith('/')) {
      return path.startsWith(prefix);
    }
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/**
 * Validates the generated document against the #1247 acceptance criteria:
 * every operation carries a unique operationId, and every allowlist entry
 * still matches at least one real route (so the allowlist cannot rot).
 */
export function validateOpenApiSpec(
  document: Record<string, unknown>,
  allowlist: IOpenApiInternalRouteAllowlist,
): IOpenApiSpecValidationResult {
  const operations = collectOperations(document);
  const violations: string[] = [];

  const missing = operations.filter(
    (operation) => operation.operationId === undefined,
  );
  for (const operation of missing) {
    violations.push(
      `Missing operationId: ${operation.method.toUpperCase()} ${operation.path}`,
    );
  }

  const byOperationId = new Map<string, IOpenApiOperationRef[]>();
  for (const operation of operations) {
    if (operation.operationId === undefined) {
      continue;
    }
    const existing = byOperationId.get(operation.operationId) ?? [];
    existing.push(operation);
    byOperationId.set(operation.operationId, existing);
  }

  for (const [operationId, refs] of byOperationId) {
    if (refs.length > 1) {
      const routes = refs
        .map((ref) => `${ref.method.toUpperCase()} ${ref.path}`)
        .join(', ');
      violations.push(`Duplicate operationId "${operationId}": ${routes}`);
    }
  }

  for (const route of allowlist.internalRoutes) {
    const matches = operations.some((operation) =>
      operation.path.startsWith(route.pathPrefix),
    );
    if (!matches) {
      violations.push(
        `Stale internal-route allowlist entry: "${route.pathPrefix}" matches no operation`,
      );
    }
  }

  const internalOperations = operations.filter((operation) =>
    isInternalRoute(operation.path, allowlist.internalRoutes),
  ).length;

  return {
    stats: {
      internalOperations,
      publicOperations: operations.length - internalOperations,
      totalOperations: operations.length,
      uniqueOperationIds: byOperationId.size,
    },
    violations,
  };
}
