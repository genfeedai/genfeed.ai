import { ContentSchedulesController } from '@api/collections/content-schedules/controllers/content-schedules.controller';
import {
  ContentSchedule,
  ContentScheduleSchema,
} from '@api/collections/content-schedules/schemas/content-schedule.schema';
import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ContentSchedulesController],
  exports: [ContentSchedulesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentSchedule.name,
          useFactory: () => {
            const schema = ContentScheduleSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, isEnabled: 1, nextRunAt: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContentSchedulesService],
})
export class ContentSchedulesModule {}
