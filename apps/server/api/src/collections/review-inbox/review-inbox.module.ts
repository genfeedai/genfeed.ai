/**
 * Review Inbox Module (#7340)
 * One publishing review inbox over workflow review gates and MCP approvals.
 * Decisions resolve through the services that own each gate.
 */

import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { McpApprovalsModule } from '@api/collections/mcp-approvals/mcp-approvals.module';
import { ReviewInboxController } from '@api/collections/review-inbox/controllers/review-inbox.controller';
import { ReviewInboxCoreModule } from '@api/collections/review-inbox/review-inbox-core.module';
import { ReviewInboxDecisionService } from '@api/collections/review-inbox/services/review-inbox-decision.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ReviewInboxController],
  imports: [
    BrandAccessModule,
    McpApprovalsModule,
    OrganizationModuleAccessModule,
    PrismaModule,
    ReviewInboxCoreModule,
    WorkflowsModule,
  ],
  providers: [ReviewInboxDecisionService, RolesGuard],
})
export class ReviewInboxModule {}
