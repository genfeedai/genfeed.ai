import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import { AgentMemoriesService } from '@server/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@server/collections/agent-memories/services/agent-memory-capture.service';
import { TaskFeedbackMemoryAdapterService } from '@server/collections/agent-memories/services/task-feedback-memory-adapter.service';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentMemoriesController],
  exports: [
    AgentMemoriesService,
    AgentMemoryCaptureService,
    TaskFeedbackMemoryAdapterService,
  ],
  imports: [BrandMemoryModule, ContextsModule],
  providers: [
    AgentMemoriesService,
    AgentMemoryCaptureService,
    TaskFeedbackMemoryAdapterService,
  ],
})
export class AgentMemoriesModule {}
