import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { MastodonController } from '@api/services/integrations/mastodon/controllers/mastodon.controller';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(MastodonService, {
  additionalImports: [HttpModule, CredentialsCoreModule],
});

@Module({
  controllers: [MastodonController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class MastodonModule {}
