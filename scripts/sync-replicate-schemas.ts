#!/usr/bin/env bun
/**
 * sync-replicate-schemas.ts
 *
 * Legacy offline snapshot exporter. Runtime schema discovery and review are
 * owned by ReplicateModelContractSyncService and ModelProviderContract.
 * Nothing in the application reads the files produced by this script.
 *
 * Usage:
 *   REPLICATE_KEY=r8_xxx bun scripts/sync-replicate-schemas.ts
 *
 * Output:
 *   apps/server/api/src/services/integrations/replicate/schemas/{model-slug}.schema.json
 *
 * Keep this utility only for one-off historical comparisons while the tracked
 * snapshots remain in the repository.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODEL_KEYS } from '../packages/constants/src/model-keys.constant';

const REPLICATE_KEY = process.env.REPLICATE_KEY;
if (!REPLICATE_KEY) {
  console.error('Error: REPLICATE_KEY environment variable is required');
  process.exit(1);
}

const SCHEMAS_DIR = join(
  process.cwd(),
  'apps/server/api/src/services/integrations/replicate/schemas',
);

/**
 * All cataloged Replicate model IDs (owner/model-name format).
 * Derive this list from MODEL_KEYS so adding a Replicate model cannot leave the
 * schema sync catalog stale.
 */
const REPLICATE_MODELS = Object.entries(MODEL_KEYS)
  .filter(([key]) => key.startsWith('REPLICATE_'))
  .map(([, modelId]) => modelId)
  .sort();

interface ReplicateModelResponse {
  latest_version?: {
    openapi_schema?: {
      components?: {
        schemas?: {
          Input?: {
            properties?: Record<string, unknown>;
            required?: string[];
            title?: string;
            type?: string;
          };
        };
      };
    };
  };
}

function modelIdToFilename(modelId: string): string {
  const parts = modelId.split('/');
  const slug = parts.length >= 2 ? parts[parts.length - 1] : modelId;
  return `${slug}.schema.json`;
}

async function fetchModelSchema(
  modelId: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://api.replicate.com/v1/models/${modelId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${REPLICATE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.warn(
      `  Warning: Failed to fetch ${modelId} (HTTP ${response.status})`,
    );
    return null;
  }

  const data = (await response.json()) as ReplicateModelResponse;
  const inputSchema =
    data.latest_version?.openapi_schema?.components?.schemas?.Input;

  if (!inputSchema) {
    console.warn(`  Warning: No input schema found for ${modelId}`);
    return null;
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    description: `Official Replicate API schema for ${modelId}`,
    properties: inputSchema.properties ?? {},
    required: inputSchema.required ?? [],
    title: `${modelIdToFilename(modelId).replace('.schema.json', '')} Input Schema`,
    type: 'object',
  };
}

async function main(): Promise<void> {
  mkdirSync(SCHEMAS_DIR, { recursive: true });

  console.log(`Syncing schemas for ${REPLICATE_MODELS.length} models...`);
  console.log(`Output directory: ${SCHEMAS_DIR}\n`);

  let synced = 0;
  let skipped = 0;

  for (const modelId of REPLICATE_MODELS) {
    const filename = modelIdToFilename(modelId);
    process.stdout.write(`  ${modelId} -> ${filename}... `);

    const schema = await fetchModelSchema(modelId);
    if (!schema) {
      skipped++;
      continue;
    }

    const filePath = join(SCHEMAS_DIR, filename);
    writeFileSync(filePath, `${JSON.stringify(schema, null, 2)}\n`);
    console.log('OK');
    synced++;

    // Rate limit: 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
