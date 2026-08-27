import '../instrument';

import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'workers' });

import process from 'node:process';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@workers/config/config.module';
import { CronFalModelWatcherModule } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.module';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import {
  assertFalApiKeyConfigured,
  parseFalModelSyncArgs,
} from '@workers/maintenance/fal-model-sync';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CronFalModelWatcherModule,
  ],
})
class FalModelSyncMaintenanceModule {}

async function main(): Promise<void> {
  parseFalModelSyncArgs(process.argv.slice(2));
  assertFalApiKeyConfigured(process.env.FAL_API_KEY);

  const app = await NestFactory.createApplicationContext(
    FalModelSyncMaintenanceModule,
    { logger: ['error'] },
  );
  const logger = app.get(LoggerService);

  try {
    logger.log('Starting protected Fal model discovery and synchronization');
    const summary = await app
      .get(CronFalModelWatcherService)
      .discoverNewModels();
    logger.log('Fal model synchronization completed', {
      draftsCreated: summary.draftsCreated,
      errors: summary.errors,
      newModelsFound: summary.newModelsFound,
      providerContractsDrifted: summary.providerContractsDrifted,
      providerContractsQuarantined: summary.providerContractsQuarantined,
      providerContractsSynchronized: summary.providerContractsSynchronized,
      totalPolled: summary.totalPolled,
    });
    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  // Do not serialize provider responses or environment values from this
  // operator path. The exception class is enough to correlate worker telemetry.
  const reason = error instanceof Error ? error.name : 'unknown';
  process.stderr.write(`Fal model synchronization failed (${reason})\n`);
  process.exitCode = 1;
});
