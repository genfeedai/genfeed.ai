import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import {
  OrgIntegration,
  OrgIntegrationSchema,
} from '@api/endpoints/integrations/schemas/org-integration.schema';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CryptoService } from '@libs/crypto/crypto.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [InternalIntegrationsController],
  exports: [IntegrationsService],
  imports: [
    MongooseModule.forFeature(
      [{ name: OrgIntegration.name, schema: OrgIntegrationSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [
    AdminApiKeyGuard,
    IntegrationsService,
    { provide: 'CryptoService', useClass: CryptoService },
  ],
})
export class IntegrationsModule {}
