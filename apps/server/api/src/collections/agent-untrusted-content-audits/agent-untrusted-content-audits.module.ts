import { AgentUntrustedContentAuditsService } from '@api/collections/agent-untrusted-content-audits/services/agent-untrusted-content-audits.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentUntrustedContentAuditsService],
  providers: [AgentUntrustedContentAuditsService],
})
export class AgentUntrustedContentAuditsModule {}
