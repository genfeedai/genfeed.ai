import { ByokModule } from '@api/services/byok/byok.module';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef } from '@nestjs/common';

export const HiggsFieldModule = createServiceModule(HiggsFieldService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => ByokModule),
    PollUntilModule,
  ],
});
