import { BreakoutRemixOfferService } from '@api/collections/outliers/services/breakout-remix-offer.service';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [BreakoutRemixOfferService],
  imports: [ActivityRecordingModule, LoggerModule, PrismaModule],
  providers: [BreakoutRemixOfferService],
})
export class BreakoutRemixOfferModule {}
