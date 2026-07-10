import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAdSyncGoogleService } from '@workers/crons/ad-sync/cron.ad-sync-google.service';
import { CronAdSyncMetaService } from '@workers/crons/ad-sync/cron.ad-sync-meta.service';
import { CronAdSyncTikTokService } from '@workers/crons/ad-sync/cron.ad-sync-tiktok.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { AdsServicesModule } from '@workers/services/ads-services.module';

@Module({
  imports: [
    AdsServicesModule,
    forwardRef(() => CredentialsModule),
    forwardRef(() => WorkersQueuesModule),
  ],
  providers: [
    CronAdSyncMetaService,
    CronAdSyncGoogleService,
    CronAdSyncTikTokService,
  ],
})
export class CronAdSyncModule {}
