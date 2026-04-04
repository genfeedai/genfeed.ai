import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { WordpressController } from '@api/services/integrations/wordpress/controllers/wordpress.controller';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(WordpressService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
});

@Module({
  controllers: [WordpressController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class WordpressModule {}
