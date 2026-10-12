import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { BrandReplicateVisionProvider } from '@api/services/brand-validation/brand-replicate-vision.provider';
import { BrandVisualAnalysisService } from '@api/services/brand-validation/brand-visual-analysis.service';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Provider-backed reading of branded visuals (#6727); off until the Admin setting enables it. */
@Module({
  exports: [BrandVisualAnalysisService],
  imports: [
    LoggerModule,
    MediaVendorCostModule,
    PlatformSettingsModule,
    ReplicateModule,
  ],
  providers: [BrandReplicateVisionProvider, BrandVisualAnalysisService],
})
export class BrandVisualAnalysisModule {}
