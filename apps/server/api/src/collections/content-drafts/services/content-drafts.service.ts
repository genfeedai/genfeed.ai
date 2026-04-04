import { CreateContentDraftDto } from '@api/collections/content-drafts/dto/create-content-draft.dto';
import { UpdateContentDraftDto } from '@api/collections/content-drafts/dto/update-content-draft.dto';
import {
  ContentDraft,
  type ContentDraftDocument,
  ContentDraftStatus,
} from '@api/collections/content-drafts/schemas/content-draft.schema';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { ContentDraftInput } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class ContentDraftsService extends BaseService<
  ContentDraftDocument,
  CreateContentDraftDto,
  UpdateContentDraftDto
> {
  constructor(
    @InjectModel(ContentDraft.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ContentDraftDocument>,
    public readonly logger: LoggerService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
  ) {
    super(model, logger);
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    status?: ContentDraftStatus,
  ): Promise<ContentDraftDocument[]> {
    return this.find({
      brand: new Types.ObjectId(brandId),
      ...(status ? { status } : {}),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async createFromSkillExecution(
    organizationId: string,
    brandId: string,
    skillSlug: string,
    runId: string,
    drafts: ContentDraftInput[],
  ): Promise<ContentDraftDocument[]> {
    const orgObjectId = new Types.ObjectId(organizationId);
    const brandObjectId = new Types.ObjectId(brandId);
    const runObjectId = new Types.ObjectId(runId);

    const created = await Promise.all(
      drafts.map((draft) =>
        this.model.create({
          brand: brandObjectId,
          confidence: draft.confidence,
          content: draft.content,
          contentRunId: runObjectId,
          generatedBy: skillSlug,
          isDeleted: false,
          mediaUrls: draft.mediaUrls ?? [],
          metadata: draft.metadata ?? {},
          organization: orgObjectId,
          platforms: draft.platforms ?? [],
          skillSlug,
          status: ContentDraftStatus.PENDING,
          type: draft.type,
        }),
      ),
    );

    await Promise.all(
      created.map((draft, index) =>
        this.trendReferenceCorpusService.recordDraftRemixLineage({
          brandId,
          contentDraftId: String(draft._id),
          draftType: drafts[index]?.type,
          generatedBy: skillSlug,
          metadata: drafts[index]?.metadata,
          organizationId,
          platforms: drafts[index]?.platforms ?? [],
          prompt: drafts[index]?.content,
        }),
      ),
    );

    return created;
  }

  /**
   * Internal creation method for content engine.
   * Bypasses DTO validation since data is programmatically constructed.
   */
  async createFromContentEngine(input: {
    organization: Types.ObjectId;
    brand: Types.ObjectId;
    skillSlug: string;
    type: string;
    content: string;
    generatedBy: string;
    status: ContentDraftStatus;
    isDeleted: boolean;
    mediaUrls?: string[];
    platforms?: string[];
    metadata?: Record<string, unknown>;
    confidence?: number;
  }): Promise<ContentDraftDocument> {
    const createdDraft = await this.model.create(input);

    await this.trendReferenceCorpusService.recordDraftRemixLineage({
      brandId: String(input.brand),
      contentDraftId: String(createdDraft._id),
      draftType: input.type,
      generatedBy: input.generatedBy,
      metadata: input.metadata,
      organizationId: String(input.organization),
      platforms: input.platforms ?? [],
      prompt: input.content,
    });

    return createdDraft;
  }

  async approve(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<ContentDraftDocument> {
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          approvedBy: new Types.ObjectId(userId),
          status: ContentDraftStatus.APPROVED,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentDraft', id);
    }

    return updated;
  }

  async reject(
    id: string,
    organizationId: string,
    reason?: string,
  ): Promise<ContentDraftDocument> {
    const metadataUpdate = reason
      ? { metadata: { rejectionReason: reason } }
      : undefined;

    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          status: ContentDraftStatus.REJECTED,
          ...(metadataUpdate ?? {}),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentDraft', id);
    }

    return updated;
  }

  async bulkApprove(
    ids: string[],
    organizationId: string,
    userId: string,
  ): Promise<{ modifiedCount: number }> {
    if (ids.length === 0) {
      return { modifiedCount: 0 };
    }

    const result = await this.model.updateMany(
      {
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          approvedBy: new Types.ObjectId(userId),
          status: ContentDraftStatus.APPROVED,
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  async editDraft(
    id: string,
    organizationId: string,
    content: string,
  ): Promise<ContentDraftDocument> {
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: { content },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentDraft', id);
    }

    return updated;
  }

  async autoPublishAboveThreshold(
    organizationId: string,
    brandId: string,
    threshold: number,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateMany(
      {
        brand: new Types.ObjectId(brandId),
        confidence: { $gte: threshold },
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        status: ContentDraftStatus.PENDING,
      },
      {
        $set: {
          status: ContentDraftStatus.APPROVED,
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }
}
