import { AgentPublishAuditsController } from '@api/collections/agent-publish-audits/controllers/agent-publish-audits.controller';
import { Module } from '@nestjs/common';
import { AgentPublishAuditsService } from '@server/collections/agent-publish-audits/services/agent-publish-audits.service';

@Module({
  controllers: [AgentPublishAuditsController],
  exports: [AgentPublishAuditsService],
  providers: [AgentPublishAuditsService],
})
export class AgentPublishAuditsModule {}
