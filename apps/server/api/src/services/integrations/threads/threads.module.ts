import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { ThreadsCallbackController } from '@api/services/integrations/threads/controllers/threads-callback.controller';
import { ThreadsCallbackService } from '@api/services/integrations/threads/services/threads-callback.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ThreadsService } from '@server/services/integrations/threads/services/threads.service';

const BaseModule = createServiceModule(ThreadsService, {
  additionalImports: [HttpModule, BrandsCoreModule, CredentialsCoreModule],
});

@Module({
  controllers: [ThreadsCallbackController, ThreadsController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: [...BaseModule.providers, ThreadsCallbackService],
})
export class ThreadsModule {}
