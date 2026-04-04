import { SolanaService } from '@api/services/integrations/solana/solana.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const SolanaModule = createServiceModule(SolanaService, {
  additionalImports: [HttpModule],
});
