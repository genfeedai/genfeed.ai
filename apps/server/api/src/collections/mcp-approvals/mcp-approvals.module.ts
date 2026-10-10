/**
 * MCP Approvals Module
 * Deferred human-approval queue for mutating MCP tool calls.
 * A PENDING row is created for every write-action; a human resolves it
 * (APPROVED/DECLINED) before the action is executed.
 */

import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { RouterModule } from '@api/services/router/router.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [McpApprovalsController],
  exports: [McpApprovalsService],
  imports: [
    ActivityRecordingModule,
    BrandAccessModule,
    RouterModule,
    ByokModule,
  ],
  providers: [McpApprovalsService, McpApprovalPricingService],
})
export class McpApprovalsModule {}
