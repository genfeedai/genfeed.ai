import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(ThreadsService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
});

@Module({
  controllers: [ThreadsController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ThreadsModule {}
