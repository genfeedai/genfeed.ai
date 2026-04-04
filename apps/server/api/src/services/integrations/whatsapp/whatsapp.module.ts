import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { WhatsappController } from '@api/services/integrations/whatsapp/controllers/whatsapp.controller';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(WhatsappService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
});

@Module({
  controllers: [WhatsappController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class WhatsappModule {}
