import { ByokModule } from '@api/services/byok/byok.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';
import { HiggsFieldService } from '@server/services/integrations/higgsfield/higgsfield.service';

export const HiggsFieldModule = createServiceModule(HiggsFieldService, {
  additionalImports: [HttpModule, ByokModule, PollUntilModule],
});
