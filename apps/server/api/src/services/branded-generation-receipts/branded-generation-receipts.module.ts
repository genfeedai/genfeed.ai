import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule],
  providers: [
    BrandIdentitySnapshotService,
    BrandedGenerationReceiptAccessService,
    BrandedGenerationPromptStoreService,
    BrandedGenerationReceiptsService,
  ],
  exports: [BrandedGenerationReceiptsService, BrandIdentitySnapshotService],
})
export class BrandedGenerationReceiptsModule {}
