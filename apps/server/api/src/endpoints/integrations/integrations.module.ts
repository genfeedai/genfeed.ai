import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { FilesMicroserviceModule } from '@api/services/files-microservice/files-microservice.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [InternalIntegrationsController],
  exports: [IntegrationsService],
  imports: [CredentialsCoreModule, forwardRef(() => FilesMicroserviceModule)],
  providers: [AdminApiKeyGuard, IntegrationsService],
})
export class IntegrationsModule {}
