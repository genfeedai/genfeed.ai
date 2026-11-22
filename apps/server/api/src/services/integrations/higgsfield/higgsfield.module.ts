import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { ByokModule } from '@api/services/byok/byok.module';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';

export const HiggsFieldModule = createServiceModule(HiggsFieldService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    ByokModule,
    PollUntilModule,
  ],
});
