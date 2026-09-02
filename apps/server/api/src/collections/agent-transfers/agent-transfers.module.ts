import { AgentTransfersController } from '@api/collections/agent-transfers/controllers/agent-transfers.controller';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import { AgentArtifactReferenceService, SERVER_TOKENS } from '@api/index';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentTransfersController],
  exports: [AgentTransfersService],
  imports: [AgentOrchestratorModule],
  providers: [
    AgentArtifactReferenceService,
    AgentTransfersService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AgentTransfersModule {}
