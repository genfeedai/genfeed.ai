/**
 * OpenAPI Type Generation Script
 *
 * Fetches the OpenAPI spec from the API server and generates TypeScript types.
 *
 * Environment Variables:
 *   OPENAPI_URL - API endpoint URL (used in CI/CD)
 *
 * Usage:
 *   bun run generate                          # Uses OPENAPI_URL or localhost:3001
 *   bun run generate --url <api-url>          # Override URL
 *   bun run generate --skip-on-error          # Don't fail if API unreachable (CI)
 *
 * CI/CD:
 *   Set OPENAPI_URL=https://api.staging.genfeed.ai/v1/openapi.json in your pipeline
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';

const logger = new Logger('GenerateApiTypes');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '../src/generated/api.d.ts');

// Parse CLI args
const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const skipOnError = args.includes('--skip-on-error');

// Priority: CLI --url > OPENAPI_URL env > localhost default
const API_URL =
  urlIndex !== -1 && args[urlIndex + 1]
    ? args[urlIndex + 1]
    : process.env.OPENAPI_URL || 'http://localhost:3001/v1/openapi.json';

async function fetchOpenAPISpec(): Promise<Record<string, unknown>> {
  logger.log(`Fetching OpenAPI spec from: ${API_URL}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function generateTypes(): Promise<void> {
  try {
    // Dynamic import for ESM compatibility
    const openapiTS = await import('openapi-typescript');

    const spec = await fetchOpenAPISpec();

    logger.log('Generating TypeScript types...');

    const output = await openapiTS.default(
      spec as Parameters<typeof openapiTS.default>[0],
      {
        exportType: true,
        transform(schemaObject) {
          // Transform ObjectId format to string type
          if (
            schemaObject &&
            typeof schemaObject === 'object' &&
            'format' in schemaObject &&
            schemaObject.format === 'ObjectId'
          ) {
            return { type: 'string' } as typeof schemaObject;
          }
          return schemaObject;
        },
      },
    );

    // Ensure output directory exists
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

    // Add header comment
    const header = `/**
 * This file is auto-generated from the OpenAPI spec.
 * DO NOT EDIT MANUALLY.
 *
 * Generated at: ${new Date().toISOString()}
 * Source: ${API_URL}
 *
 * To regenerate:
 *   cd packages/api-types && bun run generate
 */

`;

    writeFileSync(OUTPUT_PATH, header + output, 'utf-8');

    logger.log(`Types generated successfully: ${OUTPUT_PATH}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if we should skip on error (CI mode)
    if (skipOnError) {
      if (existsSync(OUTPUT_PATH)) {
        logger.warn(
          `Warning: Could not generate types (${errorMessage}). Using existing types.`,
        );
        return;
      }
      logger.warn(
        `Warning: Could not generate types and no existing types found. Build may fail.`,
      );
      return;
    }

    logger.error('Failed to generate types:', errorMessage);
    logger.error('\nTips:');
    logger.error('  - Ensure the API server is running');
    logger.error('  - Set OPENAPI_URL env var for CI/CD');
    logger.error('  - Use --skip-on-error to continue with existing types');
    process.exit(1);
  }
}

generateTypes();
