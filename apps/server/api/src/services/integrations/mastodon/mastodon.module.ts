import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { MastodonController } from '@api/services/integrations/mastodon/controllers/mastodon.controller';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MastodonService } from '@server/services/integrations/mastodon/services/mastodon.service';

const BaseModule = createServiceModule(MastodonService, {
  additionalImports: [HttpModule, BrandsModule, CredentialsCoreModule],
});

@Module({
  controllers: [MastodonController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class MastodonModule {}
