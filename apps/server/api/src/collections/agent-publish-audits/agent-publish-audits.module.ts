import { AgentPublishAuditsController } from '@api/collections/agent-publish-audits/controllers/agent-publish-audits.controller';
import { AgentPublishAuditsService } from '@api/collections/agent-publish-audits/services/agent-publish-audits.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentPublishAuditsController],
  exports: [AgentPublishAuditsService],
  providers: [AgentPublishAuditsService],
})
export class AgentPublishAuditsModule {}
