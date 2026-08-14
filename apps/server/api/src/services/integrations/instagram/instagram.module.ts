import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { InstagramController } from '@api/services/integrations/instagram/controllers/instagram.controller';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(InstagramService, {
  additionalImports: [
    forwardRef(() => HttpModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsCoreModule),
  ],
});

@Module({
  controllers: [InstagramController],
  exports: [...(BaseModule.exports ?? []), InstagramAuthorizedSignalsService],
  imports: [...(BaseModule.imports ?? []), SocialWarmupEnrollmentsModule],
  providers: [
    ...(BaseModule.providers ?? []),
    InstagramAuthorizedSignalsService,
  ],
})
export class InstagramModule {}
