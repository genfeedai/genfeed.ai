/**
 * Monitored Accounts Module
 * Manages Twitter/X accounts being monitored for the reply bot system.
 * When a monitored account tweets, the bot can auto-reply.
 */
import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import {
  MonitoredAccount,
  MonitoredAccountSchema,
} from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [MonitoredAccountsController],
  exports: [MonitoredAccountsService, MongooseModule],
  imports: [
    ApifyModule,
    forwardRef(() => ReplyBotModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: MonitoredAccount.name,
          useFactory: () => {
            const schema = MonitoredAccountSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for efficient queries
            schema.index(
              { isActive: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for Twitter user ID lookups
            schema.index(
              { organization: 1, twitterUserId: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for bot config lookups
            schema.index(
              { botConfig: 1, isActive: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [MonitoredAccountsService],
})
export class MonitoredAccountsModule {}
