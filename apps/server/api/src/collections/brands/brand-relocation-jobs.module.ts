import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { BRAND_RELOCATION_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [BrandRelocationJobsService],
  imports: [
    BrandsCoreModule,
    ActivityRecordingModule,
    PrismaModule,
    LoggerModule,
    BullModule.registerQueue({ name: BRAND_RELOCATION_QUEUE }),
  ],
  providers: [BrandRelocationJobsService],
})
export class BrandRelocationJobsModule {}
