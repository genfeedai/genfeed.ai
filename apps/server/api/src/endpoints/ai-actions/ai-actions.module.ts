import { AiActionsController } from '@api/endpoints/ai-actions/ai-actions.controller';
import { AiActionsService } from '@api/endpoints/ai-actions/ai-actions.service';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AiActionsController],
  exports: [AiActionsService],
  imports: [
    AgentContextAssemblyModule,
    ByokModule,
    LoggerModule,
    OpenRouterModule,
  ],
  providers: [AiActionsService],
})
export class AiActionsModule {}
