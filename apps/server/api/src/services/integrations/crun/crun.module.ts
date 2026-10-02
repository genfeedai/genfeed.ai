import { CreditsModule } from '@api/collections/credits/credits.module';
import { WebhooksMediaModule } from '@api/endpoints/webhooks/webhooks-media.module';
import { CrunCoreModule } from '@api/services/integrations/crun/crun-core.module';
import { CrunTaskFinalizationService } from '@api/services/integrations/crun/crun-task-finalization.service';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    CrunCoreModule,
    WebhooksMediaModule,
    CreditsModule,
    MediaVendorCostModule,
  ],
  providers: [CrunTaskFinalizationService],
  exports: [CrunCoreModule, CrunTaskFinalizationService],
})
export class CrunModule {}
