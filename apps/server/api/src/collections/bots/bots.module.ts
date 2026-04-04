/**
 * Bots Module
 * Automated bot configurations: chatbot setups, automated responses,
and social media automation rules.
 */

import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import { Bot, BotSchema } from '@api/collections/bots/schemas/bot.schema';
import {
  LivestreamBotSession,
  LivestreamBotSessionSchema,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsLivestreamDeliveryService } from '@api/collections/bots/services/bots-livestream-delivery.service';
import { BotsLivestreamRuntimeService } from '@api/collections/bots/services/bots-livestream-runtime.service';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BotsController],
  exports: [BotsService, BotsLivestreamService, MongooseModule],
  imports: [
    CredentialsModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Bot.name,
          useFactory: () => {
            const schema = BotSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
        {
          name: LivestreamBotSession.name,
          useFactory: () => {
            const schema = LivestreamBotSessionSchema;

            schema.plugin(mongooseAggregatePaginateV2);
            schema.index(
              { bot: 1, isDeleted: 1, organization: 1 },
              {
                partialFilterExpression: { isDeleted: false },
                unique: true,
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
    ReplicateModule,
  ],
  providers: [
    BotsService,
    BotsLivestreamRuntimeService,
    BotsLivestreamDeliveryService,
    BotsLivestreamService,
  ],
})
export class BotsModule {}
