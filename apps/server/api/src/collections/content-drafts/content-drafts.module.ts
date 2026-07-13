import { ContentDraftsController } from '@api/collections/content-drafts/controllers/content-drafts.controller';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentDraftsController],
  exports: [ContentDraftsService],
  imports: [forwardRef(() => TrendsModule)],
  providers: [
    AgentArtifactReferenceService,
    ContentDraftsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class ContentDraftsModule {}
