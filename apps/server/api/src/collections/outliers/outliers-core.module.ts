import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { OutlierInputsService } from '@api/collections/outliers/services/outlier-inputs.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule],
  providers: [
    OutlierConfigurationService,
    OutlierInputsService,
    OutliersService,
  ],
  exports: [OutlierConfigurationService, OutlierInputsService, OutliersService],
})
export class OutliersCoreModule {}
