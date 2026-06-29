/**
 * BrandInterviewModule — stateful brand context interview engine.
 * Detects in-scope gaps (identity/voice/strategy) and asks targeted questions
 * to fill them. Credits are charged once at session start.
 *
 * NOTE: Uses an explicit @Module (not createServiceModule) because this module
 * registers a controller in addition to providers.
 */
import { BrandInterviewController } from '@api/collections/brands/brand-interview/controllers/brand-interview.controller';
import { BrandInterviewService } from '@api/collections/brands/brand-interview/services/brand-interview.service';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BrandInterviewController],
  exports: [BrandInterviewService],
  imports: [
    // CreditsUtilsService — swapped to OSS no-op in community mode
    forwardRef(() => CreditsModule),
    // PrismaService, CacheInvalidationService, and LoggerService are all @Global
    // (PrismaModule, CacheModule, LoggerModule) so no local import needed.
  ],
  providers: [BrandInterviewService],
})
export class BrandInterviewModule {}
