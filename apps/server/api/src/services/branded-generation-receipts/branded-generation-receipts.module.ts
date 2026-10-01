import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule],
  providers: [
    BrandedGenerationReceiptAccessService,
    BrandedGenerationPromptStoreService,
    BrandedGenerationReceiptsService,
  ],
  exports: [BrandedGenerationReceiptsService],
})
export class BrandedGenerationReceiptsModule {}
