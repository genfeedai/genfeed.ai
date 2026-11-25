import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BrandedGenerationReceiptsModule,
    BrandValidationModule,
    PrismaModule,
  ],
  providers: [MediaGenerationReceiptsService],
  exports: [MediaGenerationReceiptsService],
})
export class MediaGenerationReceiptsModule {}
