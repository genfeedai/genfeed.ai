import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import type { INestApplication } from '@nestjs/common';
import {
  buildStableOpenApiDocument,
  createOpenApiBuilderOptions,
  OPENAPI_ARTIFACT_INFO,
  serializeOpenApiDocument,
} from './openapi-document.util';
import { validateOpenApiSpec } from './openapi-spec-validation.util';

/**
 * Headless spec-emit gate (#1247), mirroring the BOOT_CHECK pattern: when
 * OPENAPI_EMIT_PATH is set, main.ts writes the full deterministic OpenAPI
 * document to that path right after the Nest app is created — before any
 * middleware, Bull Board queues, or the listener — and exits. The document
 * info block is pinned so the artifact does not vary with the emitting
 * environment.
 *
 * Returns true when a document was emitted and the process should exit 0.
 * Throws when the generated document violates operationId uniqueness or
 * coverage, so CI fails loudly instead of committing a broken artifact.
 */
export function maybeEmitOpenApiDocument(app: INestApplication): boolean {
  const emitPath = process.env.OPENAPI_EMIT_PATH;
  if (!emitPath) {
    return false;
  }

  const document = buildStableOpenApiDocument(
    app,
    createOpenApiBuilderOptions(OPENAPI_ARTIFACT_INFO),
  );

  const { stats, violations } = validateOpenApiSpec(
    document as unknown as Record<string, unknown>,
    { description: '', internalRoutes: [] },
  );

  if (violations.length > 0) {
    throw new Error(
      `OpenAPI emit aborted — ${violations.length} violation(s):\n${violations.join('\n')}`,
    );
  }

  mkdirSync(dirname(emitPath), { recursive: true });
  writeFileSync(emitPath, serializeOpenApiDocument(document));

  console.info(
    `OpenAPI document emitted to ${emitPath} (${stats.totalOperations} operations, ${stats.uniqueOperationIds} operationIds)`,
  );

  return true;
}
