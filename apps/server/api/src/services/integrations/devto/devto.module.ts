import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DevtoController } from '@api/services/integrations/devto/controllers/devto.controller';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(DevtoService, {
  additionalImports: [
    HttpModule,
    ArticlesModule,
    BrandsModule,
    CredentialsCoreModule,
  ],
});

@Module({
  controllers: [DevtoController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class DevtoModule {}
