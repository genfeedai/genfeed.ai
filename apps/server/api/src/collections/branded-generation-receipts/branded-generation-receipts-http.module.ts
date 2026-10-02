import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [BrandedGenerationReceiptsModule],
  controllers: [BrandedGenerationReceiptsController],
})
export class BrandedGenerationReceiptsHttpModule {}
