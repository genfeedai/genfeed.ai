import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { BrandedGenerationFeedbackService } from '@api/services/branded-generation-receipts/branded-generation-feedback.service';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [BrandAccessModule, PrismaModule],
  providers: [
    BrandedGenerationArtifactMaterialService,
    BrandIdentitySnapshotService,
    BrandedGenerationFeedbackService,
    BrandedGenerationReceiptAccessService,
    BrandedGenerationPromptStoreService,
    BrandedGenerationReceiptsService,
  ],
  exports: [
    BrandedGenerationArtifactMaterialService,
    BrandedGenerationFeedbackService,
    BrandedGenerationReceiptsService,
    BrandIdentitySnapshotService,
  ],
})
export class BrandedGenerationReceiptsModule {}
