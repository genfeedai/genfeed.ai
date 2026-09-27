/**
 * MCP Approvals Module
 * Deferred human-approval queue for mutating MCP tool calls.
 * A PENDING row is created for every write-action; a human resolves it
 * (APPROVED/DECLINED) before the action is executed.
 */
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [McpApprovalsController],
  exports: [McpApprovalsService],
  imports: [ActivityRecordingModule],
  providers: [McpApprovalsService],
})
export class McpApprovalsModule {}
