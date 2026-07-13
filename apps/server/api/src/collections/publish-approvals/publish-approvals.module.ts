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
    PublishApprovalsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class PublishApprovalsModule {}
