import { ByokModule } from '@api/services/byok/byok.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { CrunContractImportService } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ByokModule, CacheModule],
  providers: [CrunContractImportService],
  exports: [CrunContractImportService],
})
export class CrunCoreModule {}
