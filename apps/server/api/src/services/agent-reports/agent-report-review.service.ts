import { AgentReportAccessService } from '@api/services/agent-reports/agent-report-access.service';
import {
  type AgentReportReviewToken,
  agentReportBindings,
  agentReportTokenKey,
} from '@api/services/agent-reports/agent-report-binding';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface ResolveAgentReportReviewInput {
  organizationId: string;
  remoteUserId: string;
  channelId: string;
  token: string;
  decision: 'approve' | 'reject';
}
@Injectable()
export class AgentReportReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly access: AgentReportAccessService,
    private readonly review: BatchGenerationReviewService,
  ) {}
  async resolve(
    platform: 'telegram' | 'discord',
    input: ResolveAgentReportReviewInput,
  ): Promise<{ success: true; message: string }> {
    const key = agentReportTokenKey(input.token);
    const receipt = await this.cache.get<AgentReportReviewToken>(key);
    if (
      !receipt ||
      receipt.organizationId !== input.organizationId ||
      receipt.platform !== platform ||
      receipt.binding.remoteUserId !== input.remoteUserId ||
      receipt.binding.channelId !== input.channelId
    )
      throw new BadRequestException('This review action is unavailable');
    const integration = await this.prisma.orgIntegration.findFirst({
      where: scopedWhere(input.organizationId, {
        id: receipt.integrationId,
        platform:
          platform === 'telegram'
            ? IntegrationPlatform.TELEGRAM
            : IntegrationPlatform.DISCORD,
        status: IntegrationStatus.ACTIVE,
      }),
    });
    const stillBound = agentReportBindings(integration?.config).some(
      (binding) =>
        binding.userId === receipt.binding.userId &&
        binding.brandId === receipt.binding.brandId &&
        binding.channelId === input.channelId &&
        binding.remoteUserId === input.remoteUserId,
    );
    if (
      !stillBound ||
      !(await this.access.canReview(
        input.organizationId,
        receipt.binding.userId,
        receipt.binding.brandId,
      ))
    )
      throw new BadRequestException('This review action is unavailable');
    const strategy = await this.prisma.agentStrategy.findFirst({
      where: scopedWhere(input.organizationId, {
        id: receipt.strategyId,
        brandId: receipt.binding.brandId,
      }),
      select: { id: true },
    });
    if (!strategy)
      throw new BadRequestException('This review action is unavailable');
    const claimed = await this.cache.getdel<AgentReportReviewToken>(key);
    if (!claimed)
      throw new BadRequestException(
        'This review action has expired or was already used',
      );
    const expected = { [receipt.postId]: receipt.postVersion };
    if (input.decision === 'approve') {
      await this.review.approveItems(
        receipt.batchId,
        [receipt.itemId],
        input.organizationId,
        receipt.binding.userId,
        false,
        expected,
      );
    } else {
      await this.review.rejectItems(
        receipt.batchId,
        [receipt.itemId],
        input.organizationId,
        'Rejected from agent report',
        receipt.binding.userId,
        expected,
      );
    }
    return {
      success: true,
      message:
        input.decision === 'approve'
          ? 'Draft approved through the review queue.'
          : 'Draft rejected.',
    };
  }
}
