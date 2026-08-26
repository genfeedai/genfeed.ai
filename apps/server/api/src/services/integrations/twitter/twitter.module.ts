import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { TwitterController } from '@api/services/integrations/twitter/controllers/twitter.controller';
import { TwitterAuthorizedSignalsService } from '@api/services/integrations/twitter/services/twitter-authorized-signals.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@server/services/integrations/twitter/services/twitter-response.mapper';

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
