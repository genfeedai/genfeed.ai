import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { TwitterController } from '@api/services/integrations/twitter/controllers/twitter.controller';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(TwitterService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => ActivitiesModule),
  ],
});

@Module({
  controllers: [TwitterController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class TwitterModule {}
