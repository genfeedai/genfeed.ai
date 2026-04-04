import {
  FanvueContent,
  type FanvueContentDocument,
} from '@api/collections/fanvue-data/schemas/fanvue-content.schema';
import {
  FanvueEarnings,
  type FanvueEarningsDocument,
} from '@api/collections/fanvue-data/schemas/fanvue-earnings.schema';
import {
  FanvueSchedule,
  type FanvueScheduleDocument,
} from '@api/collections/fanvue-data/schemas/fanvue-schedule.schema';
import {
  FanvueSubscriber,
  type FanvueSubscriberDocument,
} from '@api/collections/fanvue-data/schemas/fanvue-subscriber.schema';
import {
  FanvueSyncLog,
  type FanvueSyncLogDocument,
} from '@api/collections/fanvue-data/schemas/fanvue-sync-log.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class FanvueDataService {
  constructor(
    @InjectModel(FanvueSubscriber.name, DB_CONNECTIONS.FANVUE)
    readonly _subscriberModel: Model<FanvueSubscriberDocument>,
    @InjectModel(FanvueContent.name, DB_CONNECTIONS.FANVUE)
    readonly _contentModel: Model<FanvueContentDocument>,
    @InjectModel(FanvueEarnings.name, DB_CONNECTIONS.FANVUE)
    readonly _earningsModel: Model<FanvueEarningsDocument>,
    @InjectModel(FanvueSchedule.name, DB_CONNECTIONS.FANVUE)
    readonly _scheduleModel: Model<FanvueScheduleDocument>,
    @InjectModel(FanvueSyncLog.name, DB_CONNECTIONS.FANVUE)
    readonly _syncLogModel: Model<FanvueSyncLogDocument>,
    readonly _logger: LoggerService,
  ) {}
}
