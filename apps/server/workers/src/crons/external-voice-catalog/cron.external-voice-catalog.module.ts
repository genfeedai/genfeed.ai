import { VoicesModule } from '@api/collections/voices/voices.module';
import { Module } from '@nestjs/common';
import { CronExternalVoiceCatalogService } from '@workers/crons/external-voice-catalog/cron.external-voice-catalog.service';

@Module({
  exports: [CronExternalVoiceCatalogService],
  imports: [VoicesModule],
  providers: [CronExternalVoiceCatalogService],
})
export class CronExternalVoiceCatalogModule {}
