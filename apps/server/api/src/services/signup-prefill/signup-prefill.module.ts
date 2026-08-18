import { BrandsModule } from '@api/collections/brands/brands.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Consumer half of signup prefill — the actual scrape → analyze → persist →
 * seed work, resolved by the workers process. The API never imports this
 * module; it only enqueues through {@link SignupPrefillQueueModule}.
 */
@Module({
  exports: [SignupPrefillService],
  imports: [
    ConfigModule,
    LoggerModule,
    BrandsModule,
    BrandScraperModule,
    HarnessProfilesModule,
  ],
  providers: [SignupPrefillService],
})
export class SignupPrefillModule {}
