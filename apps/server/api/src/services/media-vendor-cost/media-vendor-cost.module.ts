import { ModelsModule } from '@api/collections/models/models.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(MediaGenerationCostService, {
  additionalExports: [MediaVendorCostLedgerService],
  additionalImports: [ModelsModule, ByokModule],
  additionalProviders: [MediaVendorCostLedgerService],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class MediaVendorCostModule {}
