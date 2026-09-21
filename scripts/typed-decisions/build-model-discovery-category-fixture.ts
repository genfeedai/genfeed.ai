/**
 * Builds the labelled set for the `model_discovery.category` decision (#4869).
 *
 * Ground truth is already in the repo: every curated row in the registry seed
 * (`UNIFIED_MODEL_CATALOG`) pairs a provider endpoint, a human-written
 * description and schema-derived capability metadata with the category an
 * operator approved. This script projects those rows into the exact `state`
 * shape `ModelDiscoveryService.buildCategoryState` sends, so the benchmark
 * exercises the real call rather than a hand-written approximation.
 *
 * Three deliberate rules keep the set honest:
 * - a row whose description is the seed's own synthetic
 *   `"<Label> (<category>)"` placeholder ships with an empty description —
 *   that string *is* the label, and a thin listing is what discovery actually
 *   meets on most endpoints anyway;
 * - retired rows are dropped; they are stale-binding placeholders, not
 *   approved models;
 * - `outputSchema` stays empty. An unambiguous output schema never reaches
 *   the decision provider (layer 1 short-circuits it), so a fixture that
 *   carried one would measure a path that does not exist.
 *
 * Usage (from the repo root):
 *   bun run build:typed-decision-fixture:model-discovery
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import {
  AGENT_CHAT_CAPABILITY,
  type ModelCatalogSeedEntry,
  UNIFIED_MODEL_CATALOG,
} from '@genfeedai/contracts/constants';

const OUTPUT_PATH = path.join(
  'apps',
  'server',
  'api',
  'test',
  'fixtures',
  'typed-decisions',
  'model-discovery-category.jsonl',
);

const QUESTION =
  'Which registry category does this generative model belong to?';

const OPTIONS: readonly ModelCategory[] = Object.values(ModelCategory);

/** The seed's placeholder description for an uncurated key. */
function isSyntheticDescription(entry: ModelCatalogSeedEntry): boolean {
  return entry.description.trim().endsWith(`(${entry.category})`);
}

/**
 * Input fields a discovered model's OpenAPI document would expose, derived
 * from the capability metadata the seed carries for the same endpoint.
 */
function buildInputFields(entry: ModelCatalogSeedEntry): string[] {
  const fields = ['prompt: string'];

  if (entry.aspectRatios?.length) {
    fields.push('aspect_ratio: string');
  }
  if (entry.durations?.length) {
    fields.push('duration: integer');
  }
  if (entry.hasEndFrame) {
    fields.push('end_frame: string');
  }
  if (entry.hasInterpolation) {
    fields.push('interpolate: boolean');
  }
  if (entry.hasSpeech || entry.hasAudioToggle) {
    fields.push('audio: boolean');
  }
  if (entry.hasResolutionOptions) {
    fields.push('resolution: string');
  }
  if ((entry.maxReferences ?? 0) > 0) {
    fields.push('reference_images: array');
  }
  if ((entry.maxOutputs ?? 0) > 1) {
    fields.push('num_outputs: integer');
  }

  return fields;
}

/**
 * Provider-published labels only. `agent-chat` is Genfeed's own marker for a
 * chat row and names the answer, so it never enters the state.
 */
function buildTags(entry: ModelCatalogSeedEntry): string[] {
  return [
    ...(entry.capabilities ?? []),
    ...(entry.supportsFeatures ?? []),
  ].filter((tag) => tag !== AGENT_CHAT_CAPABILITY);
}

function main(): void {
  const rows = UNIFIED_MODEL_CATALOG.filter(
    (entry) => entry.lifecycle !== ModelLifecycle.RETIRED,
  ).map((entry) => {
    const isSynthetic = isSyntheticDescription(entry);

    return {
      expected: entry.category,
      options: OPTIONS,
      question: QUESTION,
      source: `registry-seed:${entry.key}${isSynthetic ? ' (name-only)' : ''}`,
      state: {
        description: isSynthetic ? '' : entry.description,
        inputFields: buildInputFields(entry),
        modelName: entry.endpoint ?? entry.key,
        outputSchema: {},
        provider: entry.provider,
        tags: buildTags(entry),
      },
    };
  });

  writeFileSync(
    OUTPUT_PATH,
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
    'utf8',
  );

  const byCategory = new Map<string, number>();
  for (const row of rows) {
    byCategory.set(row.expected, (byCategory.get(row.expected) ?? 0) + 1);
  }

  process.stdout.write(`Wrote ${rows.length} rows to ${OUTPUT_PATH}\n`);
  for (const [category, count] of [...byCategory].sort()) {
    process.stdout.write(`  ${category}: ${count}\n`);
  }
}

main();
