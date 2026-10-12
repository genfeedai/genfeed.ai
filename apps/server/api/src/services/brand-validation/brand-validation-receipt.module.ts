import { BrandRenderEvidenceModule } from '@api/services/brand-render-evidence/brand-render-evidence.module';
import { BrandFactCheckModule } from '@api/services/brand-validation/brand-fact-check.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandVisualAnalysisModule } from '@api/services/brand-validation/brand-visual-analysis.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BrandFactCheckModule,
    BrandValidationModule,
    BrandVisualAnalysisModule,
    BrandRenderEvidenceModule,
    BrandedGenerationReceiptsModule,
  ],
  providers: [BrandValidationReceiptService],
  exports: [BrandValidationReceiptService],
})
export class BrandValidationReceiptModule {}
