import '../instrument';

import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import process from 'node:process';
import { loadFirstPartySkillDefinitions } from '@api/collections/skills/catalog/first-party-skill-loader';
import { ReferenceDataSyncModule } from '@api/seeds/reference-data-sync.module';
import { ReferenceDataSyncService } from '@api/seeds/reference-data-sync.service';
import { STUDIO_ELEMENT_CATALOG } from '@api/seeds/studio-element-catalog';
import { UNIFIED_MODEL_CATALOG } from '@genfeedai/contracts/constants';
import { STUDIO_SYSTEM_PRESETS } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import { REVIEWED_RATE_SHEET_ENTRIES } from '@genfeedai/pricing';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Module({
  imports: [LoggerModule, ReferenceDataSyncModule],
})
class ReferenceDataSyncCliModule {}

function parseArgs(argv: string[]): {
  isLive: boolean;
  validateRuntime: boolean;
} {
  return {
    isLive: argv.includes('--live'),
    validateRuntime: argv.includes('--validate-runtime'),
  };
}

function validateRuntimeCatalogs(): void {
  const skillCount = loadFirstPartySkillDefinitions().length;
  const elementCount = STUDIO_ELEMENT_CATALOG.reduce(
    (total, domain) => total + domain.entries.length,
    0,
  );
  process.stdout.write(
    `Reference-data sync runtime ready (models=${UNIFIED_MODEL_CATALOG.length}, rates=${REVIEWED_RATE_SHEET_ENTRIES.length}, skills=${skillCount}, presets=${STUDIO_SYSTEM_PRESETS.length}, elements=${elementCount})\n`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.validateRuntime) {
    validateRuntimeCatalogs();
    return;
  }
  if (!args.isLive) {
    process.stderr.write(
      'Reference-data sync requires --live to write, or --validate-runtime to load catalogs without a database.\n',
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(
    ReferenceDataSyncCliModule,
    { logger: ['error'] },
  );
  const logger = app.get(LoggerService);

  try {
    logger.log('Starting reference-data sync');
    const report = await app.get(ReferenceDataSyncService).reconcile();
    if (report.failedDomains.length > 0) {
      process.stderr.write(
        `Reference-data sync failed: ${report.failedDomains.join(', ')}\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.name : 'unknown';
  process.stderr.write(`Reference-data sync failed (${reason})\n`);
  process.exitCode = 1;
});
