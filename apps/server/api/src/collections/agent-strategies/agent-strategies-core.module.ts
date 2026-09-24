import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule, LoggerModule],
  providers: [AgentStrategiesService],
  exports: [AgentStrategiesService],
})
export class AgentStrategiesCoreModule {}
