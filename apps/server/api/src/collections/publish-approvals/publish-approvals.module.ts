import { PublishApprovalsController } from '@api/collections/publish-approvals/controllers/publish-approvals.controller';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PublishApprovalsController],
  exports: [PublishApprovalsService],
  providers: [
    AgentArtifactReferenceService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      inject: [PrismaService, AgentArtifactReferenceService, LoggerService],
      provide: PublishApprovalsService,
      useFactory: (
        prisma: PrismaService,
        artifactReferenceService: AgentArtifactReferenceService,
        logger: LoggerService,
      ) =>
        new PublishApprovalsService(prisma, artifactReferenceService, logger),
    },
  ],
})
export class PublishApprovalsModule {}
