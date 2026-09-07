import { SocialSourcesModule } from '@api/collections/social-sources/social-sources.module';
import { Module } from '@nestjs/common';
import { CronSocialSourceResyncService } from '@workers/crons/social-sources/cron.social-source-resync.service';

@Module({
  exports: [CronSocialSourceResyncService],
  imports: [SocialSourcesModule],
  providers: [CronSocialSourceResyncService],
})
export class CronSocialSourceResyncModule {}
