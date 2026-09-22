import { Module } from '@nestjs/common';
import { CronOAuthClientCleanupService } from '@workers/crons/oauth-client-cleanup/cron.oauth-client-cleanup.service';

@Module({
  exports: [CronOAuthClientCleanupService],
  providers: [CronOAuthClientCleanupService],
})
export class CronOAuthClientCleanupModule {}
