import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { RedditController } from '@api/services/integrations/reddit/controllers/reddit.controller';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(RedditService, {
  additionalImports: [HttpModule, BrandsCoreModule, CredentialsCoreModule],
});

@Module({
  controllers: [RedditController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class RedditModule {}
