import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import {
  AgentMemory,
  AgentMemorySchema,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [AgentMemoriesController],
  exports: [AgentMemoriesService, AgentMemoryCaptureService],
  imports: [
    BrandMemoryModule,
    ContextsModule,
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentMemory.name,
          useFactory: () => {
            const schema = AgentMemorySchema;
            schema.index({ createdAt: -1, organization: 1, user: 1 });
            schema.index({
              campaignId: 1,
              createdAt: -1,
              organization: 1,
              scope: 1,
            });
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [AgentMemoriesService, AgentMemoryCaptureService],
})
export class AgentMemoriesModule {}
