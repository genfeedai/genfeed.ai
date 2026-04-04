import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { RedditController } from '@api/services/integrations/reddit/controllers/reddit.controller';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(RedditService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
});

@Module({
  controllers: [RedditController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class RedditModule {}
