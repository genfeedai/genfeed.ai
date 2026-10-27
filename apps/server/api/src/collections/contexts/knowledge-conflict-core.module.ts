import { KnowledgeConflictDetectionService } from '@api/collections/contexts/services/knowledge-conflict-detection.service';
import { KnowledgeConflictJudgeService } from '@api/collections/contexts/services/knowledge-conflict-judge.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Conflict detection without the HTTP surface, shared by the API and the workers. */
@Module({
  exports: [KnowledgeConflictDetectionService],
  imports: [PrismaModule, LoggerModule, LlmDispatcherModule],
  providers: [KnowledgeConflictDetectionService, KnowledgeConflictJudgeService],
})
export class KnowledgeConflictCoreModule {}
