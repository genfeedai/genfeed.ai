import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(BeehiivService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
});

@Module({
  controllers: [BeehiivController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class BeehiivModule {}
