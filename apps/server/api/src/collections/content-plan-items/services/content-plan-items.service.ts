import {
  ContentPlanItem,
  type ContentPlanItemDocument,
} from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ContentPlanItemStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

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
    @InjectModel(ContentPlanItem.name, DB_CONNECTIONS.CLOUD)
    private readonly model: AggregatePaginateModel<ContentPlanItemDocument>,
    public readonly logger: LoggerService,
  ) {}

  createMany(
    items: CreateContentPlanItemInput[],
  ): Promise<ContentPlanItemDocument[]> {
    const docs = items.map((item) => ({
      brand: new Types.ObjectId(item.brand),
      confidence: item.confidence,
      isDeleted: false,
      organization: new Types.ObjectId(item.organization),
      pipelineSteps: item.pipelineSteps ?? [],
      plan: new Types.ObjectId(item.plan),
      platforms: item.platforms,
      prompt: item.prompt,
      scheduledAt: item.scheduledAt,
      skillSlug: item.skillSlug,
      status: ContentPlanItemStatus.PENDING,
      topic: item.topic,
      type: item.type,
    }));

    return this.model.create(docs);
  }

  listByPlan(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanItemDocument[]> {
    return this.model
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        plan: new Types.ObjectId(planId),
      })
      .sort({ scheduledAt: 1 })
      .exec();
  }

  listPendingByPlan(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanItemDocument[]> {
    return this.model
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        plan: new Types.ObjectId(planId),
        status: ContentPlanItemStatus.PENDING,
      })
      .sort({ scheduledAt: 1 })
      .exec();
  }

  async getByIdOrFail(
    organizationId: string,
    itemId: string,
  ): Promise<ContentPlanItemDocument> {
    const item = await this.model.findOne({
      _id: new Types.ObjectId(itemId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
  ): Promise<ContentPlanItemDocument> {
    const setFields: Record<string, unknown> = { status };

    if (updates?.contentDraftId) {
      setFields.contentDraftId = updates.contentDraftId;
    }
    if (updates?.error) {
      setFields.error = updates.error;
    }
    if (updates?.confidence !== undefined) {
      setFields.confidence = updates.confidence;
    }

    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(itemId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: setFields },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentPlanItem', itemId);
    }

    return updated;
  }

  async softDeleteByPlan(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    await this.model.updateMany(
      {
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        plan: new Types.ObjectId(planId),
      },
      { $set: { isDeleted: true } },
    );
  }
}
