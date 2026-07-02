import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { UnipileController } from '@api/services/integrations/unipile/controllers/unipile.controller';
import { UnipileService } from '@api/services/integrations/unipile/services/unipile.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(UnipileService, {
  additionalImports: [
    CredentialsCoreModule,
    forwardRef(() => HttpModule),
    PrismaModule,
  ],
});

@Module({
  controllers: [UnipileController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class UnipileModule {}
