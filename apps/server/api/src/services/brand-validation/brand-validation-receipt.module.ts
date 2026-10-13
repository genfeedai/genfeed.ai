import { BrandRenderEvidenceModule } from '@api/services/brand-render-evidence/brand-render-evidence.module';
import { BrandFactCheckModule } from '@api/services/brand-validation/brand-fact-check.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandVisionQueueService } from '@api/services/brand-validation/brand-vision-queue.service';
import { BrandVisualAnalysisModule } from '@api/services/brand-validation/brand-visual-analysis.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BRAND_VISION_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

/**
 * The brand validation receipt lifecycle. A visual's OCR and placement checks wait for a
 * background job on `BRAND_VISION_QUEUE`; the workers runtime owns its consumer.
 */
@Module({
  imports: [
    BrandFactCheckModule,
    BrandValidationModule,
    BrandVisualAnalysisModule,
    BrandRenderEvidenceModule,
    BrandedGenerationReceiptsModule,
    BullModule.registerQueue({ name: BRAND_VISION_QUEUE }),
    LoggerModule,
  ],
  providers: [BrandValidationReceiptService, BrandVisionQueueService],
  exports: [BrandValidationReceiptService],
})
export class BrandValidationReceiptModule {}
