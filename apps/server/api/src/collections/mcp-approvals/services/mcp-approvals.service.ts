import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { UpdateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/update-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { McpApprovalStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class McpApprovalsService extends BaseService<
  McpApprovalDocument,
  CreateMcpApprovalDto,
  UpdateMcpApprovalDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {
    super(prisma, 'mcpApproval', logger);
  }

  async createPending(
    organizationId: string,
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpApprovalDocument> {
    const approval = (await this.delegate.create({
      data: {
        organizationId,
        userId,
        toolName,
        arguments: args,
        status: McpApprovalStatus.PENDING,
      },
    })) as McpApprovalDocument;

    try {
      await this.notificationsPublisher.publishNotification({
        organizationId,
        userId,
        notification: {
          type: 'mcp_approval_pending',
          title: 'MCP Tool Approval Required',
          message: `MCP tool "${toolName}" requires approval`,
          metadata: {
            approvalId: approval.id,
            toolName,
          },
        },
      });
    } catch (error: unknown) {
      this.logger?.error('Failed to publish MCP approval notification', {
        approvalId: approval.id,
        error: (error as Error)?.message,
      });
    }

    return approval;
  }

  async findByOrganization(
    organizationId: string,
    status?: McpApprovalStatus,
  ): Promise<McpApprovalDocument[]> {
    const docs = await this.delegate.findMany({
      where: {
        organizationId,
        isDeleted: false,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs as McpApprovalDocument[];
  }

  async resolve(
    id: string,
    organizationId: string,
    decision: 'approve' | 'decline',
    result?: Record<string, unknown>,
  ): Promise<McpApprovalDocument> {
    const existing = (await this.delegate.findFirst({
      where: { id, organizationId, isDeleted: false },
    })) as McpApprovalDocument | null;

    if (!existing) {
      throw new NotFoundException('MCP approval not found');
    }

    if (existing.status !== McpApprovalStatus.PENDING) {
      throw new BadRequestException('Approval already resolved');
    }

    const status =
      decision === 'approve'
        ? McpApprovalStatus.APPROVED
        : McpApprovalStatus.DECLINED;

    return (await this.delegate.update({
      where: { id },
      data: {
        status,
        resolvedAt: new Date(),
        ...(result !== undefined && { result }),
      },
    })) as McpApprovalDocument;
  }
}
