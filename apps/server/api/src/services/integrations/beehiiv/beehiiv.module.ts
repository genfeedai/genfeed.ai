import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(BeehiivService, {
  additionalImports: [HttpModule, BrandsModule, CredentialsCoreModule],
});

@Module({
  controllers: [BeehiivController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class BeehiivModule {}
