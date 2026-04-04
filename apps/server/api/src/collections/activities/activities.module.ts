/**
 * Activities Module
 * Activity logging: user actions, audit trails, activity feeds,
and analytics tracking.
 */
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import {
  Activity,
  ActivitySchema,
} from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MembersModule } from '@api/collections/members/members.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ActivitiesController],
  exports: [MongooseModule, ActivitiesService],
  imports: [
    MembersModule,
    forwardRef(() => StreaksModule),

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Activity.name,
          useFactory: () => {
            const schema = ActivitySchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({
              brand: 1,
              key: 1,
              organization: 1,
              user: 1,
            });

            schema.index(
              {
                createdAt: -1,
                isDeleted: 1,
                user: 1,
              },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for entity lookups - critical for performance
            schema.index(
              { entityId: 1, entityModel: 1 },
              { partialFilterExpression: { entityId: { $exists: true } } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
