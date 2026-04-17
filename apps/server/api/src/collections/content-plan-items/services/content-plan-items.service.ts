import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CreateContentPlanItemInput {
  organization: string;
  plan: string;
  brand: string;
  type: string;
  topic: string;
  prompt?: string;
  platforms: string[];
  scheduledAt?: Date;
  skillSlug?: string;
  pipelineSteps?: Array<{
    type: string;
    model: string;
    prompt?: string;
    aspectRatio?: string;
    duration?: number;
    imageUrl?: string;
    voiceId?: string;
    text?: string;
  }>;
  confidence?: number;
}

@Injectable()
export class ContentPlanItemsService {
  constructor(
    private readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {}

  async createMany(
    items: CreateContentPlanItemInput[],
  ): Promise<Record<string, unknown>[]> {
    const created = await Promise.all(
      items.map((item) =>
        this.prisma.contentPlanItem.create({
          data: {
            brandId: item.brand,
            confidence: item.confidence,
            isDeleted: false,
            organizationId: item.organization,
            pipelineSteps: item.pipelineSteps ?? [],
            planId: item.plan,
            platforms: item.platforms,
            prompt: item.prompt,
            scheduledAt: item.scheduledAt,
            skillSlug: item.skillSlug,
            status: ContentPlanItemStatus.PENDING,
            topic: item.topic,
            type: item.type,
          },
        }),
      ),
    );

    return created;
  }

  listByPlan(
    organizationId: string,
    planId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.contentPlanItem.findMany({
      orderBy: { scheduledAt: 'asc' },
      where: {
        isDeleted: false,
        organizationId,
        planId,
      },
    });
  }

  listPendingByPlan(
    organizationId: string,
    planId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.contentPlanItem.findMany({
      orderBy: { scheduledAt: 'asc' },
      where: {
        isDeleted: false,
        organizationId,
        planId,
        status: ContentPlanItemStatus.PENDING,
      },
    });
  }

  async getByIdOrFail(
    organizationId: string,
    itemId: string,
  ): Promise<Record<string, unknown>> {
    const item = await this.prisma.contentPlanItem.findFirst({
      where: {
        id: itemId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!item) {
      throw new NotFoundException('ContentPlanItem', itemId);
    }

    return item;
  }

  async updateStatus(
    organizationId: string,
    itemId: string,
    status: ContentPlanItemStatus,
    updates?: { contentDraftId?: string; error?: string; confidence?: number },
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.contentPlanItem.findFirst({
      where: { id: itemId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentPlanItem', itemId);
    }

    return this.prisma.contentPlanItem.update({
      data: {
        ...(updates?.confidence !== undefined
          ? { confidence: updates.confidence }
          : {}),
        ...(updates?.contentDraftId
          ? { contentDraftId: updates.contentDraftId }
          : {}),
        ...(updates?.error ? { error: updates.error } : {}),
        status,
      },
      where: { id: itemId },
    });
  }

  async softDeleteByPlan(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    await this.prisma.contentPlanItem.updateMany({
      data: { isDeleted: true },
      where: {
        isDeleted: false,
        organizationId,
        planId,
      },
    });
  }
}
