import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ExpertPositioningService } from '@api/services/expert-path/services/expert-positioning.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Expert Path positioning core: answer persistence, scoring, and the harness
 * profile draft. Imported by the brand interview; has no HTTP surface.
 */
@Module({
  exports: [ExpertPositioningService],
  imports: [BrandMemoryModule, HarnessProfilesModule, LoggerModule],
  providers: [ExpertPositioningService],
})
export class ExpertPositioningModule {}
