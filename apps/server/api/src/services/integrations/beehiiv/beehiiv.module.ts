import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BeehiivService } from '@server/services/integrations/beehiiv/services/beehiiv.service';

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
