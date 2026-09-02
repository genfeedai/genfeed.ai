import { LeonardoAIService } from '@api/services/integrations/leonardoai/services/leonardoai.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const LeonardoAIModule = createServiceModule(LeonardoAIService);
