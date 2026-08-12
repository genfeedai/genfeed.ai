import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessWinnerPromotionService,
  ],
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => HarnessProfilesModule),
    forwardRef(() => ContentPerformanceModule),
  ],
  providers: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessWinnerPromotionService,
  ],
})
export class ContentHarnessModule {}
