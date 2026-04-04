import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import {
  Distribution,
  DistributionSchema,
} from '@api/collections/distributions/schemas/distribution.schema';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [DistributionsController],
  exports: [MongooseModule, DistributionsService],
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => CredentialsModule),
    forwardRef(() => TelegramDistributionModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Distribution.name,
          useFactory: () => {
            const schema = DistributionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Organization-scoped queries
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Platform-filtered queries
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, platform: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Scheduled distributions (for cron processing)
            schema.index(
              { isDeleted: 1, scheduledAt: 1, status: 1 },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  status: 'scheduled',
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [DistributionsService],
})
export class DistributionsModule {}
