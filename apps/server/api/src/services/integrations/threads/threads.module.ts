import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { ThreadsCallbackController } from '@api/services/integrations/threads/controllers/threads-callback.controller';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { ThreadsCallbackService } from '@api/services/integrations/threads/services/threads-callback.service';
import { ThreadsReplyService } from '@api/services/integrations/threads/services/threads-reply.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ThreadsService, {
  additionalExports: [ThreadsReplyService],
  additionalProviders: [ThreadsReplyService],
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsCoreModule,
    CredentialsCoreModule,
    ActivitiesModule,
  ],
});

@Module({
  controllers: [ThreadsCallbackController, ThreadsController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: [...(BaseModule.providers ?? []), ThreadsCallbackService],
})
export class ThreadsModule {}
