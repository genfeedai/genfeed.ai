import {
  Activity,
  ActivitySchema,
} from '@api/collections/activities/schemas/activity.schema';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { StreaksController } from '@api/collections/streaks/controllers/streaks.controller';
import {
  Streak,
  StreakSchema,
} from '@api/collections/streaks/schemas/streak.schema';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [StreaksController],
  exports: [StreaksService],
  imports: [
    forwardRef(() => CreditsModule),
    NotificationsModule,
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Streak.name,
          useFactory: () => {
            const schema = StreakSchema;

            schema.index({ organization: 1, user: 1 }, { unique: true });
            schema.index(
              { currentStreak: 1, lastActivityDate: 1 },
              {
                partialFilterExpression: {
                  currentStreak: { $gt: 0 },
                  isDeleted: false,
                },
              },
            );

            return schema;
          },
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Activity.name,
          useFactory: () => ActivitySchema,
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [StreaksService],
})
export class StreaksModule {}
