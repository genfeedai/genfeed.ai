import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CryptoService } from '@libs/crypto/crypto.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [InternalIntegrationsController],
  exports: [IntegrationsService],
  providers: [
    AdminApiKeyGuard,
    IntegrationsService,
    { provide: 'CryptoService', useClass: CryptoService },
  ],
})
export class IntegrationsModule {}
