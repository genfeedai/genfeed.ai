/**
 * MCP Approvals Module
 * Deferred human-approval queue for mutating MCP tool calls.
 * A PENDING row is created for every write-action; a human resolves it
 * (APPROVED/DECLINED) before the action is executed.
 */
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [McpApprovalsController],
  exports: [McpApprovalsService],
  imports: [NotificationsPublisherModule],
  providers: [McpApprovalsService],
})
export class McpApprovalsModule {}
