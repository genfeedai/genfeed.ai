import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { MastodonController } from '@api/services/integrations/mastodon/controllers/mastodon.controller';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(MastodonService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
});

@Module({
  controllers: [MastodonController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class MastodonModule {}
