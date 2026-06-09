/**
 * Seed Script: Prelaunch Reference Corpus
 *
 * Backfills the global trend/reference corpus with credential-free public
 * source references. Dry-run is the default. Pass `--live` to apply writes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/prelaunch-reference-corpus.seed.ts
 *   bun run apps/server/api/scripts/seeds/prelaunch-reference-corpus.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/prelaunch-reference-corpus.seed.ts --env=production --live
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AppModule } from '@api/app.module';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const logger = new Logger('PrelaunchReferenceCorpusSeed');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

interface SeedArgs {
  dryRun: boolean;
  env?: string;
}

function loadEnvFile(): void {
  const args = process.argv.slice(2);
  const envArg = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const envSuffix = envArg || 'local';
  const envPath = resolve(scriptDir, '..', '..', `.env.${envSuffix}`);

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (envArg || !process.env[key]) {
        process.env[key] = value;
      }
    }

    logger.log(`Loaded env from .env.${envSuffix}`);
  } catch {
    logger.log(`No .env.${envSuffix} found, using process env / defaults`);
  }
}

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);

  return {
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
  };
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'log', 'warn'],
  });

  try {
    const trendsService = app.get(TrendsService);
    const result = await trendsService.backfillPrelaunchReferenceCorpus({
      dryRun: args.dryRun,
    });

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} prelaunch corpus ${args.env ? `for ${args.env} ` : ''}version=${result.version}`,
    );
    logger.log(
      `seedTrends=${result.seedTrends}, seedReferences=${result.seedReferences}, plannedCreates=${result.plannedCreates}, plannedUpdates=${result.plannedUpdates}`,
    );
    logger.log(
      `createdTrends=${result.createdTrends}, updatedTrends=${result.updatedTrends}, referencesSynced=${result.referenceSync.references}, links=${result.referenceSync.links}, snapshots=${result.referenceSync.snapshots}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  logger.error('Prelaunch reference corpus seed failed', error);
  process.exit(1);
});
