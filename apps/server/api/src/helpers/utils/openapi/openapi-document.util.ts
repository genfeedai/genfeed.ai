import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Pinned info block for the emitted spec artifact. The served document uses
 * env-derived version/description; the committed artifact must not vary with
 * the environment it was generated in, so the emit path pins both.
 */
export const OPENAPI_ARTIFACT_INFO = {
  description: 'Genfeed.ai API',
  version: '1.0.0',
} as const;

/**
 * Stable operationId for every exposed route: `<ControllerClass>.<method>`.
 * Uniqueness is guaranteed by controller class-name uniqueness (guarded by
 * controller-class-names.spec.ts) plus method-name uniqueness within a class.
 * MCP tool names are derived from these ids (#1246), so the format must not
 * change without a migration plan for generated tool names.
 */
export function stableOperationIdFactory(
  controllerKey: string,
  methodKey: string,
): string {
  return `${controllerKey}.${methodKey}`;
}

/**
 * Recursively sorts object keys so JSON serialization is byte-stable
 * regardless of decorator evaluation or module registration order. Arrays are
 * order-significant in OpenAPI (parameters, enums, required) and are left
 * untouched.
 */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted as T;
  }

  return value;
}

/**
 * Shared DocumentBuilder options for the Genfeed API. Both the served
 * /v1/openapi.json document and the emitted artifact are built from this, so
 * the artifact provably matches what the API serves.
 */
export function createOpenApiBuilderOptions(params: {
  description: string;
  version: string;
}): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Genfeed.ai API')
    .setDescription(params.description)
    .setVersion(params.version)
    .addBearerAuth()
    .addServer('/v1')
    .build();
}

/**
 * Creates the full OpenAPI document with stable operationIds and
 * deterministically sorted keys.
 */
export function buildStableOpenApiDocument(
  app: INestApplication,
  builderOptions: Omit<OpenAPIObject, 'paths'>,
): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, builderOptions, {
    operationIdFactory: stableOperationIdFactory,
  });

  return sortKeysDeep(document);
}

/**
 * Canonical serialization of the document: sorted keys, 2-space indent,
 * trailing newline. Emitting twice from the same build yields identical bytes.
 */
export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(sortKeysDeep(document), null, 2)}\n`;
}
