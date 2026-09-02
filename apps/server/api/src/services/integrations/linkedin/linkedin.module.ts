import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LinkedInAuthorizedSignalsService } from '@api/services/integrations/linkedin/services/linkedin-authorized-signals.service';
import { LinkedInTrendResolverService } from '@api/services/integrations/linkedin/services/linkedin-trend-resolver.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const LINKEDIN_TREND_RESOLVER_PROVIDER = {
  provide: SERVER_TOKENS.linkedInTrends,
  useExisting: LinkedInTrendResolverService,
};

const BaseModule = createServiceModule(LinkedInService, {
  additionalImports: [
    HttpModule,
    BrandScraperModule,
    BrandsCoreModule,
    CredentialsCoreModule,
  ],
  additionalProviders: [
    LinkedInTrendResolverService,
    LINKEDIN_TREND_RESOLVER_PROVIDER,
  ],
});

@Module({
  controllers: [LinkedInController],
  exports: [...(BaseModule.exports ?? []), LinkedInAuthorizedSignalsService],
  imports: [...(BaseModule.imports ?? []), SocialWarmupEnrollmentsModule],
  providers: [
    ...(BaseModule.providers ?? []),
    LinkedInAuthorizedSignalsService,
  ],
})
export class LinkedInModule {}
