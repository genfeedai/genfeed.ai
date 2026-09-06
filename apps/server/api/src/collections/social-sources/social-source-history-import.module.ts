import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Scheduling half of the own-account history import. Kept separate from
 * `SocialSourcesModule` so integration modules (Instagram, TikTok, X) can
 * schedule an import after OAuth without importing the collector chain that
 * depends on them.
 */
@Module({
  exports: [SocialSourceHistoryImportService],
  imports: [ActivitiesModule, LoggerModule, WorkflowsCoreModule],
  providers: [SocialSourceHistoryImportService],
})
export class SocialSourceHistoryImportModule {}
