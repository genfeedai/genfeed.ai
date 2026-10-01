import { ByokModule } from '@api/services/byok/byok.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { CrunContractImportService } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ByokModule, CacheModule],
  providers: [
    CrunContractImportService,
    CrunClient,
    CrunTaskService,
    CrunQuoteService,
  ],
  exports: [
    CrunContractImportService,
    CrunClient,
    CrunTaskService,
    CrunQuoteService,
  ],
})
export class CrunCoreModule {}
