import { FanvueDataController } from '@api/collections/fanvue-data/controllers/fanvue-data.controller';
import {
  FanvueContent,
  FanvueContentSchema,
} from '@api/collections/fanvue-data/schemas/fanvue-content.schema';
import {
  FanvueEarnings,
  FanvueEarningsSchema,
} from '@api/collections/fanvue-data/schemas/fanvue-earnings.schema';
import {
  FanvueSchedule,
  FanvueScheduleSchema,
} from '@api/collections/fanvue-data/schemas/fanvue-schedule.schema';
import {
  FanvueSubscriber,
  FanvueSubscriberSchema,
} from '@api/collections/fanvue-data/schemas/fanvue-subscriber.schema';
import {
  FanvueSyncLog,
  FanvueSyncLogSchema,
} from '@api/collections/fanvue-data/schemas/fanvue-sync-log.schema';
import { FanvueDataService } from '@api/collections/fanvue-data/services/fanvue-data.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [FanvueDataController],
  exports: [FanvueDataService],
  imports: [
    MongooseModule.forFeature(
      [
        { name: FanvueSubscriber.name, schema: FanvueSubscriberSchema },
        { name: FanvueContent.name, schema: FanvueContentSchema },
        { name: FanvueEarnings.name, schema: FanvueEarningsSchema },
        { name: FanvueSchedule.name, schema: FanvueScheduleSchema },
        { name: FanvueSyncLog.name, schema: FanvueSyncLogSchema },
      ],
      DB_CONNECTIONS.FANVUE,
    ),
  ],
  providers: [FanvueDataService],
})
export class FanvueDataModule {}
