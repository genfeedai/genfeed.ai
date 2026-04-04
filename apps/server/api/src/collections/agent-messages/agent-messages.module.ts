/**
 * Agent Messages Module
 * Stores individual agent chat messages in a separate collection
 * instead of embedding them in the AgentRoom document.
 */
import {
  AgentMessageDoc,
  AgentMessageDocSchema,
} from '@api/collections/agent-messages/schemas/agent-message.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [AgentMessagesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentMessageDoc.name,
          useFactory: () => {
            const schema = AgentMessageDocSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, room: 1 },
              {
                name: 'idx_room_messages_by_org',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, room: 1 },
              {
                name: 'idx_recent_messages',
                partialFilterExpression: { isDeleted: false },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [AgentMessagesService],
})
export class AgentMessagesModule {}
