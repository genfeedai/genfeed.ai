import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentMemoriesController],
  exports: [AgentMemoriesService, AgentMemoryCaptureService],
  imports: [BrandMemoryModule, ContextsModule],
  providers: [AgentMemoriesService, AgentMemoryCaptureService],
})
export class AgentMemoriesModule {}
