import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialSourceHistoryImportModule } from '@api/collections/social-sources/social-source-history-import.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { TiktokController } from '@api/services/integrations/tiktok/controllers/tiktok.controller';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TiktokAuthorizedSignalsService } from '@api/services/integrations/tiktok/services/tiktok-authorized-signals.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(TiktokService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsCoreModule,
    CredentialsCoreModule,
  ],
});

@Module({
  controllers: [TiktokController],
  exports: [...(BaseModule.exports ?? []), TiktokAuthorizedSignalsService],
  imports: [
    ...(BaseModule.imports ?? []),
    SocialWarmupEnrollmentsModule,
    SocialSourceHistoryImportModule,
  ],
  providers: [...(BaseModule.providers ?? []), TiktokAuthorizedSignalsService],
})
export class TiktokModule {}
