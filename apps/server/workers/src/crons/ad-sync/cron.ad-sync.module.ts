import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAdSyncGoogleService } from '@workers/crons/ad-sync/cron.ad-sync-google.service';
import { CronAdSyncMetaService } from '@workers/crons/ad-sync/cron.ad-sync-meta.service';
import { CronAdSyncTikTokService } from '@workers/crons/ad-sync/cron.ad-sync-tiktok.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => AdPerformanceModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => MetaAdsModule),
    forwardRef(() => WorkersQueuesModule),
  ],
  providers: [
    CronAdSyncMetaService,
    CronAdSyncGoogleService,
    CronAdSyncTikTokService,
  ],
})
export class CronAdSyncModule {}
