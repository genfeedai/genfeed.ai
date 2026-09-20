import process from 'node:process';
import { runHarnessProfileSeed } from '@api-scripts/seeds/harness-profiles-from-packs.seed';
import { Logger } from '@nestjs/common';

const logger = new Logger('HarnessProfileSeedEntrypoint');

void runHarnessProfileSeed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error(
      'Harness profile seed failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
