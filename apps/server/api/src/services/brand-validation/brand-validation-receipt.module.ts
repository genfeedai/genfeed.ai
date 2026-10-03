import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [BrandValidationModule, BrandedGenerationReceiptsModule],
  providers: [BrandValidationReceiptService],
  exports: [BrandValidationReceiptService],
})
export class BrandValidationReceiptModule {}
