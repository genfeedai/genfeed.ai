import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

/** Run persistence only. Operations/HTTP stay on AgentRunsModule. */
@Module({
  exports: [AgentRunsService],
  providers: [
    AgentArtifactReferenceService,
    AgentRunsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AgentRunsCoreModule {}
