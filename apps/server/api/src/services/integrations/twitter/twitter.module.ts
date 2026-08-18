import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { TwitterController } from '@api/services/integrations/twitter/controllers/twitter.controller';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterAuthorizedSignalsService } from '@api/services/integrations/twitter/services/twitter-authorized-signals.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(TwitterService, {
  additionalProviders: [TwitterResponseMapper],
  additionalImports: [
    HttpModule,
    BrandsCoreModule,
    CredentialsCoreModule,
    ActivitiesModule,
  ],
});

@Module({
  controllers: [TwitterController],
  exports: [...(BaseModule.exports ?? []), TwitterAuthorizedSignalsService],
  imports: [...(BaseModule.imports ?? []), SocialWarmupEnrollmentsModule],
  providers: [...(BaseModule.providers ?? []), TwitterAuthorizedSignalsService],
})
export class TwitterModule {}
