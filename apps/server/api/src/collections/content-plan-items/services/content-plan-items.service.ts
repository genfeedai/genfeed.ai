import type {
  ContentPlanItemDocument,
  ContentPlanPipelineStep,
} from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import {
  asDate,
  asNumber,
  asRecord,
  asString,
  dateToTime,
  serializeDate,
} from '@api/collections/content-plans/utils/content-plan-data.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/enums';
import type { ContentPlanItem as PrismaContentPlanItem } from '@genfeedai/prisma';
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
  ): Promise<ContentPlanItemDocument[]> {
    const created = await Promise.all(
      items.map((item) =>
        this.prisma.contentPlanItem.create({
          data: {
            brandId: item.brand,
            data: this.buildDataPayload({
              confidence: item.confidence,
              pipelineSteps: item.pipelineSteps,
              platforms: item.platforms,
              prompt: item.prompt,
              scheduledAt: item.scheduledAt,
              skillSlug: item.skillSlug,
              status: ContentPlanItemStatus.PENDING,
              topic: item.topic,
              type: item.type,
            }) as never,
            isDeleted: false,
            organizationId: item.organization,
            planId: item.plan,
          },
        }),
      ),
    );

    return created.map((doc) => this.toDocument(doc));
  }

  async listByPlan(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanItemDocument[]> {
    const docs = await this.prisma.contentPlanItem.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        isDeleted: false,
        organizationId,
        planId,
      },
    });

    return this.sortByScheduledAt(docs.map((doc) => this.toDocument(doc)));
  }

  async listPendingByPlan(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanItemDocument[]> {
    const docs = await this.listByPlan(organizationId, planId);
    return docs.filter((doc) => doc.status === ContentPlanItemStatus.PENDING);
  }

  async getByIdOrFail(
    organizationId: string,
    itemId: string,
  ): Promise<ContentPlanItemDocument> {
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

    return this.toDocument(item);
  }

  async updateStatus(
    organizationId: string,
    itemId: string,
    status: ContentPlanItemStatus,
    updates?: { contentDraftId?: string; error?: string; confidence?: number },
  ): Promise<ContentPlanItemDocument> {
    const existing = await this.prisma.contentPlanItem.findFirst({
      where: {
        id: itemId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('ContentPlanItem', itemId);
    }

    const updated = await this.prisma.contentPlanItem.update({
      data: {
        data: this.buildDataPayload(
          {
            confidence: updates?.confidence,
            contentDraftId: updates?.contentDraftId,
            error: updates?.error,
            status,
          },
          existing.data,
        ) as never,
      },
      where: { id: itemId },
    });

    return this.toDocument(updated);
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

  private toDocument(doc: PrismaContentPlanItem): ContentPlanItemDocument {
    const data = asRecord(doc.data);

    return {
      ...doc,
      _id: doc.mongoId ?? doc.id,
      brand: doc.brandId,
      confidence: asNumber(data.confidence),
      contentDraftId: asString(data.contentDraftId) ?? null,
      data,
      error: asString(data.error) ?? null,
      organization: doc.organizationId,
      pipelineSteps: this.asPipelineSteps(data.pipelineSteps),
      plan: doc.planId,
      platforms: this.asStringArray(data.platforms),
      prompt: asString(data.prompt) ?? null,
      scheduledAt: asDate(data.scheduledAt),
      skillSlug: asString(data.skillSlug) ?? null,
      status:
        this.asContentPlanItemStatus(data.status) ??
        ContentPlanItemStatus.PENDING,
      topic: asString(data.topic) ?? null,
      type: asString(data.type),
    };
  }

  private buildDataPayload(
    data: Partial<
      CreateContentPlanItemInput & {
        contentDraftId?: string;
        error?: string;
        status?: ContentPlanItemStatus;
      }
    >,
    existingData?: unknown,
  ): Record<string, unknown> {
    const payload = asRecord(existingData);

    if (data.type !== undefined) {
      payload.type = data.type;
    }

    if (data.topic !== undefined) {
      payload.topic = data.topic;
    }

    if (data.prompt !== undefined) {
      payload.prompt = data.prompt;
    }

    if (data.platforms !== undefined) {
      payload.platforms = [...data.platforms];
    }

    if (data.scheduledAt !== undefined) {
      payload.scheduledAt = serializeDate(data.scheduledAt);
    }

    if (data.skillSlug !== undefined) {
      payload.skillSlug = data.skillSlug;
    }

    if (data.pipelineSteps !== undefined) {
      payload.pipelineSteps = data.pipelineSteps.map((step) => ({ ...step }));
    }

    if (data.confidence !== undefined) {
      payload.confidence = data.confidence;
    }

    if (data.contentDraftId !== undefined) {
      payload.contentDraftId = data.contentDraftId;
    }

    if (data.error !== undefined) {
      payload.error = data.error;
    }

    if (data.status !== undefined) {
      payload.status = data.status;
    }

    return payload;
  }

  private sortByScheduledAt(
    items: ContentPlanItemDocument[],
  ): ContentPlanItemDocument[] {
    return [...items].sort((left, right) => {
      const leftTime = dateToTime(left.scheduledAt) ?? Number.MAX_SAFE_INTEGER;
      const rightTime =
        dateToTime(right.scheduledAt) ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private asPipelineSteps(value: unknown): ContentPlanPipelineStep[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (step): step is Record<string, unknown> =>
          Boolean(step) && typeof step === 'object' && !Array.isArray(step),
      )
      .map((step) => ({
        aspectRatio: asString(step.aspectRatio),
        duration: asNumber(step.duration),
        imageUrl: asString(step.imageUrl),
        model: asString(step.model) ?? '',
        prompt: asString(step.prompt),
        text: asString(step.text),
        type: asString(step.type) ?? 'text-to-image',
        voiceId: asString(step.voiceId),
      }));
  }

  private asContentPlanItemStatus(
    value: unknown,
  ): ContentPlanItemStatus | undefined {
    return Object.values(ContentPlanItemStatus).find(
      (status) => status === value,
    );
  }
}
