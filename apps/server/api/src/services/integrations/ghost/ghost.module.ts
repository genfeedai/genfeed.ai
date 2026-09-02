import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { GhostController } from '@api/services/integrations/ghost/controllers/ghost.controller';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(GhostService, {
  additionalImports: [HttpModule, BrandsModule, CredentialsCoreModule],
});

@Module({
  controllers: [GhostController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class GhostModule {}
