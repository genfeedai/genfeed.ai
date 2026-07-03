import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { TaskFeedbackMemoryAdapterService } from '@api/collections/agent-memories/services/task-feedback-memory-adapter.service';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentMemoriesController],
  exports: [
    AgentMemoriesService,
    AgentMemoryCaptureService,
    TaskFeedbackMemoryAdapterService,
  ],
  imports: [
    forwardRef(() => BrandMemoryModule),
    forwardRef(() => ContextsModule),
  ],
  providers: [
    AgentMemoriesService,
    AgentMemoryCaptureService,
    TaskFeedbackMemoryAdapterService,
  ],
})
export class AgentMemoriesModule {}
