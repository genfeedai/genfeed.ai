import {
  ContentRun,
  type ContentRunAnalyticsSummary,
  type ContentRunBrief,
  type ContentRunDocument,
  type ContentRunPublishContext,
  type ContentRunRecommendation,
  type ContentRunVariant,
} from '@api/collections/content-runs/schemas/content-run.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export interface CreateContentRunInput {
  brand: string;
  brief?: ContentRunBrief;
  creditsUsed: number;
  input: Record<string, unknown>;
  organization: string;
  analyticsSummary?: ContentRunAnalyticsSummary;
  publish?: ContentRunPublishContext;
  recommendations?: ContentRunRecommendation[];
  skillSlug: string;
  source: ContentRunSource;
  status: ContentRunStatus;
  variants?: ContentRunVariant[];
}

export interface UpdateContentRunInput {
  analyticsSummary?: ContentRunAnalyticsSummary;
  brief?: ContentRunBrief;
  creditsUsed?: number;
  duration?: number;
  error?: string;
  output?: Record<string, unknown>;
  publish?: ContentRunPublishContext;
  recommendations?: ContentRunRecommendation[];
  source?: ContentRunSource;
  status?: ContentRunStatus;
  variants?: ContentRunVariant[];
}

@Injectable()
export class ContentRunsService {
  constructor(
    @InjectModel(ContentRun.name, DB_CONNECTIONS.CLOUD)
    private readonly contentRunModel: Model<ContentRunDocument>,
  ) {}

  createRun(payload: CreateContentRunInput): Promise<ContentRunDocument> {
    return this.contentRunModel.create({
      ...payload,
      brand: new Types.ObjectId(payload.brand),
      isDeleted: false,
      organization: new Types.ObjectId(payload.organization),
    });
  }

  async patchRun(
    organizationId: string,
    runId: string,
    patch: UpdateContentRunInput,
  ): Promise<ContentRunDocument> {
    const filter = {
      _id: new Types.ObjectId(runId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
    const result = (await this.contentRunModel.findOneAndUpdate(
      filter as never,
      { $set: patch } as never,
      { new: true },
    )) as ContentRunDocument | null;

    if (!result) {
      throw new NotFoundException('ContentRun', runId);
    }

    return result;
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    skillSlug?: string,
    status?: ContentRunStatus,
  ): Promise<ContentRunDocument[]> {
    const query: Record<string, unknown> = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (skillSlug) {
      query.skillSlug = skillSlug;
    }

    if (status) {
      query.status = status;
    }

    return this.contentRunModel
      .find(query as never)
      .sort({ createdAt: -1 })
      .lean();
  }

  getRunById(
    organizationId: string,
    runId: string,
  ): Promise<ContentRunDocument | null> {
    return this.contentRunModel.findOne({
      _id: new Types.ObjectId(runId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    } as never);
  }
}
