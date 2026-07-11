import { createServiceModule } from '@api/shared/service-module.factory';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';

export const LeonardoAIModule = createServiceModule(LeonardoAIService);
