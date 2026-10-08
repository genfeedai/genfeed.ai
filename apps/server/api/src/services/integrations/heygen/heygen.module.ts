import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { HeyGenController } from '@api/services/integrations/heygen/controllers/heygen.controller';
import { HEYGEN_IDENTITY_SERVICE } from '@api/services/integrations/heygen/heygen.tokens';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenIdentityService } from '@api/services/integrations/heygen/services/heygen-identity.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(HeyGenService, {
  additionalImports: [
    HttpModule,
    ApiKeyHelperModule,
    PollUntilModule,
    ByokModule,
  ],
});

@Module({
  controllers: [HeyGenController],
  exports: [
    ...(BaseModule.exports ?? []),
    HeyGenIdentityService,
    HEYGEN_IDENTITY_SERVICE,
  ],
  imports: BaseModule.imports,
  providers: [
    ...(BaseModule.providers ?? []),
    HeyGenIdentityService,
    { provide: HEYGEN_IDENTITY_SERVICE, useExisting: HeyGenIdentityService },
  ],
})
export class HeyGenModule {}
