import type {
  ContentPlanItemDocument,
  ContentPlanPipelineStep,
} from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import {
  asDate,
  asNumber,
  asRecord,
  asString,
  serializeDate,
} from '@api/collections/content-plans/utils/content-plan-data.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/contracts';
import {
  type ContentPlanItem as PrismaContentPlanItem,
  toPrismaJson,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CreateContentPlanItemInput {
  organizationId: string;
  planId: string;
  brandId: string;
  type: string;
  topic: string;
  /** Generated prompt text stored in the item payload — not a Prompt row id. */
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
            brandId: item.brandId,
            data: toPrismaJson(
              this.buildDataPayload({
                confidence: item.confidence,
                pipelineSteps: item.pipelineSteps,
                platforms: item.platforms,
                // relation-alias-ok: prompt text payload, not a Prompt row id
                prompt: item.prompt,
                scheduledAt: item.scheduledAt,
                skillSlug: item.skillSlug,
                status: ContentPlanItemStatus.PENDING,
                topic: item.topic,
                type: item.type,
              }),
            ),
            isDeleted: false,
            organizationId: item.organizationId,
            planId: item.planId,
            scheduledAt: item.scheduledAt,
            status: ContentPlanItemStatus.PENDING,
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
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      where: scopedWhere(organizationId, { planId }),
    });

    return docs.map((doc) => this.toDocument(doc));
  }

  async listPendingByPlan(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanItemDocument[]> {
    const docs = await this.prisma.contentPlanItem.findMany({
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      where: scopedWhere(organizationId, {
        planId,
        status: ContentPlanItemStatus.PENDING,
      }),
    });

    return docs.map((doc) => this.toDocument(doc));
  }

  async getByIdOrFail(
    organizationId: string,
    itemId: string,
  ): Promise<ContentPlanItemDocument> {
    const item = await this.prisma.contentPlanItem.findFirst({
      where: scopedWhere(organizationId, { id: itemId }),
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
    updates?: { error?: string; confidence?: number; postId?: string },
  ): Promise<ContentPlanItemDocument> {
    const existing = await this.prisma.contentPlanItem.findFirst({
      where: scopedWhere(organizationId, { id: itemId }),
    });

    if (!existing) {
      throw new NotFoundException('ContentPlanItem', itemId);
    }

    const updated = await this.prisma.contentPlanItem.update({
      data: {
        data: toPrismaJson(
          this.buildDataPayload(
            {
              confidence: updates?.confidence,
              postId: updates?.postId,
              error: updates?.error,
              status,
            },
            existing.data,
          ),
        ),
        status,
      },
      where: scopedWhere(organizationId, { id: itemId }),
    });

    return this.toDocument(updated);
  }

  async softDeleteByPlan(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    await this.prisma.contentPlanItem.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, { planId }),
    });
  }

  private toDocument(doc: PrismaContentPlanItem): ContentPlanItemDocument {
    const data = asRecord(doc.data);

    return {
      ...doc,
      brand: doc.brandId,
      confidence: asNumber(data.confidence),
      postId: asString(data.postId) ?? null,
      data,
      error: asString(data.error) ?? null,
      organization: doc.organizationId,
      pipelineSteps: this.asPipelineSteps(data.pipelineSteps),
      plan: doc.planId,
      platforms: this.asStringArray(data.platforms),
      prompt: asString(data.prompt) ?? null,
      scheduledAt: doc.scheduledAt ?? asDate(data.scheduledAt),
      skillSlug: asString(data.skillSlug) ?? null,
      status:
        this.asContentPlanItemStatus(doc.status) ??
        this.asContentPlanItemStatus(data.status) ??
        ContentPlanItemStatus.PENDING,
      topic: asString(data.topic) ?? null,
      type: asString(data.type),
    };
  }

  private buildDataPayload(
    data: Partial<
      CreateContentPlanItemInput & {
        postId?: string;
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

    if (data.postId !== undefined) {
      payload.postId = data.postId;
    }

    if (data.error !== undefined) {
      payload.error = data.error;
    }

    if (data.status !== undefined) {
      payload.status = data.status;
    }

    return payload;
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
