import { BrandRenderEvidenceService } from '@api/services/brand-render-evidence/brand-render-evidence.service';
import { BrandRenderFontStagingService } from '@api/services/brand-render-evidence/brand-render-font-staging.service';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [BrandedGenerationReceiptsModule, PrismaModule],
  providers: [BrandRenderEvidenceService, BrandRenderFontStagingService],
  exports: [BrandRenderEvidenceService, BrandRenderFontStagingService],
})
export class BrandRenderEvidenceModule {}
