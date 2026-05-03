#!/usr/bin/env bun
/**
 * set-model-succeeded-by.ts
 *
 * One-shot migration to set `succeededBy` on legacy models so the
 * CronModelDeprecationService can auto-deprecate them when successors mature.
 *
 * Usage:
 *   MONGODB_URI=mongodb+srv://... bun scripts/migrations/set-model-succeeded-by.ts
 *
 * Dry-run (default): prints what would change.
 * Apply:  MONGODB_URI=... bun scripts/migrations/set-model-succeeded-by.ts --apply
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required');
  process.exit(1);
}
const mongodbUri = MONGODB_URI;

const isDryRun = !process.argv.includes('--apply');

/**
 * Mapping: legacy model key → successor model key.
 * Once set, the deprecation cron checks the successor's maturity (30+ days active,
 * <5% usage on the predecessor, no active workflows) before setting isDeprecated.
 */
const SUCCESSION_MAP: Record<string, string> = {
  // Kling lineage
  'kwaivgi/kling-v1.6-pro': 'kwaivgi/kling-v2.6',
  'kwaivgi/kling-v2.1': 'kwaivgi/kling-v2.6',
  'kwaivgi/kling-v2.1-master': 'kwaivgi/kling-v2.6',
  'kwaivgi/kling-v2.5-turbo-pro': 'kwaivgi/kling-v3-video',

  // Veo lineage
  'google/veo-2': 'google/veo-3.1',
  'google/veo-3': 'google/veo-3.1',
  'google/veo-3-fast': 'google/veo-3.1-fast',

  // FLUX lineage
  'black-forest-labs/flux-1.1-pro': 'black-forest-labs/flux-2-pro',

  // Imagen lineage
  'google/imagen-3': 'google/imagen-4',
  'google/imagen-3-fast': 'google/imagen-4-fast',

  // Sora lineage
  'openai/sora-2': 'openai/sora-2-pro',

  // Nano Banana lineage
  'google/nano-banana': 'google/nano-banana-2',

  // WAN Video lineage
  'wan-video/wan-2.2-i2v-fast': 'wan-video/wan-2.7-t2v',

  // Seedream lineage
  'bytedance/seedream-4': 'bytedance/seedream-4.5',
};

async function main(): Promise<void> {
  const client = new MongoClient(mongodbUri);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('models');

    console.log(
      isDryRun ? '🔍 DRY RUN (pass --apply to execute)\n' : '🚀 APPLYING\n',
    );

    let updated = 0;
    let skipped = 0;

    for (const [legacyKey, successorKey] of Object.entries(SUCCESSION_MAP)) {
      const model = await collection.findOne({
        key: legacyKey,
        isDeleted: false,
      });

      if (!model) {
        console.log(`  SKIP: ${legacyKey} — not found in DB`);
        skipped++;
        continue;
      }

      if (model.succeededBy === successorKey) {
        console.log(`  SKIP: ${legacyKey} — already set to ${successorKey}`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`  WOULD SET: ${legacyKey} → succeededBy: ${successorKey}`);
      } else {
        await collection.updateOne(
          { _id: model._id },
          {
            $set: {
              succeededBy: successorKey,
              isLegacy: true,
            },
          },
        );
        console.log(`  SET: ${legacyKey} → succeededBy: ${successorKey}`);
      }
      updated++;
    }

    // Also set predecessorOf on successor models
    for (const [legacyKey, successorKey] of Object.entries(SUCCESSION_MAP)) {
      const successor = await collection.findOne({
        key: successorKey,
        isDeleted: false,
      });

      if (!successor) continue;
      if (successor.predecessorOf) continue; // Don't overwrite existing

      if (!isDryRun) {
        await collection.updateOne(
          { _id: successor._id },
          { $set: { predecessorOf: legacyKey } },
        );
      }
    }

    console.log(`\n✅ Done. Updated: ${updated}, Skipped: ${skipped}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
