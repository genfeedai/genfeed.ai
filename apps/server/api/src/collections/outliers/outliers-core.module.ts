import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BreakoutResponseReadsService } from '@api/collections/outliers/services/breakout-response-reads.service';
import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { OutlierInputsService } from '@api/collections/outliers/services/outlier-inputs.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { WinnerClassificationService } from '@api/collections/outliers/services/winner-classification.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [BrandAccessModule, PrismaModule],
  providers: [
    BrandedGenerationReceiptAccessService,
    BreakoutResponseReadsService,
    OutlierConfigurationService,
    OutlierInputsService,
    OutliersService,
    WinnerClassificationService,
  ],
  exports: [
    OutlierConfigurationService,
    OutlierInputsService,
    OutliersService,
    BreakoutResponseReadsService,
    WinnerClassificationService,
  ],
})
export class OutliersCoreModule {}
