import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { RouterModule } from '@api/services/router/router.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { CONTEXT_EMBEDDING_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    RouterModule,
    OpenRouterModule,
    BrandAccessModule,
    BullModule.registerQueue({ name: CONTEXT_EMBEDDING_QUEUE }),
  ],
  providers: [
    KnowledgeEmbeddingCompletionService,
    ContextEmbeddingSweepService,
    ContextEmbeddingService,
    ContextEmbeddingProviderService,
    ContextEmbeddingQueueService,
    ContextEmbeddingWriteService,
  ],
  exports: [
    KnowledgeEmbeddingCompletionService,
    ContextEmbeddingSweepService,
    ContextEmbeddingService,
    ContextEmbeddingProviderService,
    ContextEmbeddingQueueService,
    ContextEmbeddingWriteService,
  ],
})
export class ContextEmbeddingCoreModule {}
