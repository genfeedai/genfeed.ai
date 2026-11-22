import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { BlueskyController } from '@api/services/integrations/bluesky/controllers/bluesky.controller';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import { BlueskyOAuthService } from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import { BlueskyOAuthKeyService } from '@api/services/integrations/bluesky/services/bluesky-oauth-key.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(BlueskyService, {
  additionalProviders: [BlueskyOAuthService, BlueskyOAuthKeyService],
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsModule,
    CredentialsCoreModule,
    ActivitiesModule,
  ],
});

@Module({
  controllers: [BlueskyController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class BlueskyModule {}
