import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';

export const ComfyUIModule = createServiceModule(ComfyUIService, {
  additionalImports: [HttpModule, PollUntilModule],
});
