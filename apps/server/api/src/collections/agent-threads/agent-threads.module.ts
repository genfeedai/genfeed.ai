/**
 * Agent Conversations Module
 * Stores agent chat threads (rooms) for AI-powered agent interactions.
 * Messages are stored separately in the AgentMessagesModule.
 */

import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import {
  AgentRun,
  AgentRunSchema,
} from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import {
  AgentRoom,
  AgentRoomSchema,
} from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  AgentThreadSnapshot,
  AgentThreadSnapshotSchema,
} from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AgentThreadsController],
  exports: [AgentThreadsService],
  imports: [
    AgentMessagesModule,
    UsersModule,
    MongooseModule.forFeature(
      [{ name: AgentRun.name, schema: AgentRunSchema }],
      DB_CONNECTIONS.AGENT,
    ),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentRoom.name,
          useFactory: () => {
            const schema = AgentRoomSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1, user: 1 },
              {
                name: 'idx_user_threads',
                partialFilterExpression: { isDeleted: false },
              },
            );

            return schema;
          },
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentThreadSnapshot.name,
          useFactory: () => AgentThreadSnapshotSchema,
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [AgentThreadsService],
})
export class AgentThreadsModule {}
