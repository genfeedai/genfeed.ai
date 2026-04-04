#!/usr/bin/env bun
/**
 * sync-replicate-schemas.ts
 *
 * Fetches the latest input schemas from the Replicate API for all known
 * Replicate models and writes them as per-model JSON schema files.
 *
 * Usage:
 *   REPLICATE_KEY=r8_xxx bun scripts/sync-replicate-schemas.ts
 *
 * Output:
 *   apps/server/api/src/services/integrations/replicate/schemas/{model-slug}.schema.json
 *
 * The generic prompt builder reads these schemas at runtime to determine
 * which fields to include when building prompts for new/unknown models.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPLICATE_KEY = process.env.REPLICATE_KEY;
if (!REPLICATE_KEY) {
  console.error('Error: REPLICATE_KEY environment variable is required');
  process.exit(1);
}

const SCHEMAS_DIR = join(
  process.cwd(),
  'apps/server/api/src/services/integrations/replicate/schemas',
);

/** Known Replicate model IDs (owner/model-name format) */
const REPLICATE_MODELS = [
  'google/imagen-3',
  'google/imagen-3-fast',
  'google/imagen-4',
  'google/imagen-4-fast',
  'google/imagen-4-ultra',
  'google/nano-banana',
  'google/nano-banana-pro',
  'google/nano-banana-2',
  'google/veo-2',
  'google/veo-3',
  'google/veo-3-fast',
  'google/veo-3.1',
  'google/veo-3.1-fast',
  'google/gemini-2.5-flash',
  'google/gemini-3-pro',
  'ideogram-ai/ideogram-character',
  'ideogram-ai/ideogram-v3-balanced',
  'ideogram-ai/ideogram-v3-quality',
  'ideogram-ai/ideogram-v3-turbo',
  'openai/gpt-5.2',
  'openai/gpt-image-1.5',
  'openai/clip',
  'openai/sora-2',
  'openai/sora-2-pro',
  'qwen/qwen-image',
  'runwayml/gen4-image-turbo',
  'bytedance/seedream-4',
  'bytedance/seedream-4.5',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-2-dev',
  'black-forest-labs/flux-2-flex',
  'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-kontext-pro',
  'black-forest-labs/flux-schnell',
  'luma/reframe-image',
  'luma/reframe-video',
  'topazlabs/image-upscale',
  'topazlabs/video-upscale',
  'kwaivgi/kling-v1.6-pro',
  'kwaivgi/kling-v2.1',
  'kwaivgi/kling-v2.1-master',
  'kwaivgi/kling-v2.5-turbo-pro',
  'prunaai/p-video',
  'wan-video/wan-2.2-i2v-fast',
  'meta/musicgen',
  'deepseek-ai/deepseek-r1',
  'meta/meta-llama-3.1-405b-instruct',
];

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
