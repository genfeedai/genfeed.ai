import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PinterestController } from '@api/services/integrations/pinterest/controllers/pinterest.controller';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(PinterestService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
});

@Module({
  controllers: [PinterestController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class PinterestModule {}
