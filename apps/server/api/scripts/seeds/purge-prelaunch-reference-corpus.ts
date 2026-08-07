#!/usr/bin/env bun
/**
 * Soft-delete every prelaunch/bootstrap synthetic trend row.
 *
 *   bun run apps/server/api/scripts/seeds/purge-prelaunch-reference-corpus.ts
 *   bun run apps/server/api/scripts/seeds/purge-prelaunch-reference-corpus.ts --live
 *
 * Dry-run by default (counts only). Pass --live to write.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../src/app.module';
import { TrendsService } from '../../src/collections/trends/services/trends.service';

const logger = new Logger('PurgePrelaunchReferenceCorpus');

async function main(): Promise<void> {
  const isLive = process.argv.includes('--live');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const trendsService = app.get(TrendsService);
    if (!isLive) {
      logger.log(
        'DRY RUN — re-run with --live to soft-delete prelaunch seed trends',
      );
      logger.log(
        'Synthetic rows are already excluded from discovery reads; purge is for DB hygiene only.',
      );
      return;
    }

    const result = await trendsService.purgeSyntheticTrendRows();
    logger.log(`Purged ${result.purged} synthetic prelaunch trend row(s)`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
