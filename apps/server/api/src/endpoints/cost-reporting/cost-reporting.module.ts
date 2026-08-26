import { CostReportingController } from '@api/endpoints/cost-reporting/cost-reporting.controller';
import { CostReportingService } from '@api/endpoints/cost-reporting/cost-reporting.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CostReportingController],
  exports: [CostReportingService],
  imports: [PrismaModule],
  providers: [CostReportingService],
})
export class CostReportingModule {}
