#!/usr/bin/env bun
/**
 * set-model-succeeded-by.ts
 *
 * One-shot migration to set `succeededBy` on legacy models so the
 * CronModelDeprecationService can auto-deprecate them when successors mature.
 *
 * Models use Prisma `Model` table with a `config` JSON column storing
 * `key`, `succeededBy`, `predecessorOf`, `isLegacy`, etc.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun scripts/migrations/set-model-succeeded-by.ts
 *
 * Dry-run (default): prints what would change.
 * Apply:  DATABASE_URL=... bun scripts/migrations/set-model-succeeded-by.ts --apply
 */

import { PrismaClient } from '@prisma/client';

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

interface ModelConfig {
  key?: string;
  succeededBy?: string;
  predecessorOf?: string;
  isLegacy?: boolean;
  [k: string]: unknown;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log(
      isDryRun ? '🔍 DRY RUN (pass --apply to execute)\n' : '🚀 APPLYING\n',
    );

    let updated = 0;
    let skipped = 0;

    // Get all active, non-deleted models
    const allModels = await prisma.model.findMany({
      where: { isActive: true, isDeleted: false },
    });

    // Index by key from config
    const modelsByKey = new Map<string, { id: string; config: ModelConfig }>();
    for (const m of allModels) {
      const config = (m.config ?? {}) as ModelConfig;
      if (config.key) {
        modelsByKey.set(config.key, { id: m.id, config });
      }
    }

    // Set succeededBy + isLegacy on predecessors
    for (const [legacyKey, successorKey] of Object.entries(SUCCESSION_MAP)) {
      const model = modelsByKey.get(legacyKey);

      if (!model) {
        console.log(`  SKIP: ${legacyKey} — not found in DB`);
        skipped++;
        continue;
      }

      if (model.config.succeededBy === successorKey) {
        console.log(`  SKIP: ${legacyKey} — already set to ${successorKey}`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`  WOULD SET: ${legacyKey} → succeededBy: ${successorKey}`);
      } else {
        const newConfig = {
          ...model.config,
          isLegacy: true,
          succeededBy: successorKey,
        };
        await prisma.model.update({
          data: { config: newConfig },
          where: { id: model.id },
        });
        console.log(`  SET: ${legacyKey} → succeededBy: ${successorKey}`);
      }
      updated++;
    }

    // Set predecessorOf on successor models
    for (const [legacyKey, successorKey] of Object.entries(SUCCESSION_MAP)) {
      const successor = modelsByKey.get(successorKey);
      if (!successor) continue;
      if (successor.config.predecessorOf) continue;

      if (!isDryRun) {
        const newConfig = {
          ...successor.config,
          predecessorOf: legacyKey,
        };
        await prisma.model.update({
          data: { config: newConfig },
          where: { id: successor.id },
        });
      }
    }

    console.log(`\n✅ Done. Updated: ${updated}, Skipped: ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
