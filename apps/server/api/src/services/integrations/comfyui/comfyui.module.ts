import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const ComfyUIModule = createServiceModule(ComfyUIService, {
  additionalImports: [HttpModule],
});
