import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(FacebookService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
});

@Module({
  controllers: [FacebookController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class FacebookModule {}
