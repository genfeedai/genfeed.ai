import { CreateContentDraftDto } from '@api/collections/content-drafts/dto/create-content-draft.dto';
import { UpdateContentDraftDto } from '@api/collections/content-drafts/dto/update-content-draft.dto';
import type { ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentDraftInput } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ContentDraftStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentDraftsService extends BaseService<
  ContentDraftDocument,
  CreateContentDraftDto,
  UpdateContentDraftDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
  ) {
    super(prisma, 'contentDraft', logger);
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    status?: ContentDraftStatus,
  ): Promise<ContentDraftDocument[]> {
    return this.delegate.findMany({
      where: {
        brandId,
        ...(status ? { status } : {}),
        isDeleted: false,
        organizationId,
      },
    }) as Promise<ContentDraftDocument[]>;
  }

  async createFromSkillExecution(
    organizationId: string,
    brandId: string,
    skillSlug: string,
    runId: string,
    drafts: ContentDraftInput[],
  ): Promise<ContentDraftDocument[]> {
    const created = await Promise.all(
      drafts.map((draft) =>
        this.delegate.create({
          data: {
            brandId,
            confidence: draft.confidence,
            content: draft.content,
            contentRunId: runId,
            generatedBy: skillSlug,
            isDeleted: false,
            mediaUrls: draft.mediaUrls ?? [],
            metadata: (draft.metadata ?? {}) as Record<string, unknown>,
            organizationId,
            platforms: draft.platforms ?? [],
            skillSlug,
            status: ContentDraftStatus.PENDING,
            type: draft.type,
          } as Record<string, unknown>,
        }),
      ),
    );

    await Promise.all(
      created.map((draft, index) =>
        this.trendReferenceCorpusService.recordDraftRemixLineage({
          brandId,
          contentDraftId: (draft as Record<string, unknown>).id as string,
          draftType: drafts[index]?.type,
          generatedBy: skillSlug,
          metadata: drafts[index]?.metadata,
          organizationId,
          platforms: drafts[index]?.platforms ?? [],
          prompt: drafts[index]?.content,
        }),
      ),
    );

    return created as ContentDraftDocument[];
  }

  /**
   * Internal creation method for content engine.
   * Bypasses DTO validation since data is programmatically constructed.
   */
  async createFromContentEngine(input: {
    organizationId: string;
    brandId: string;
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
    const createdDraft = await this.delegate.create({
      data: input as Record<string, unknown>,
    });

    await this.trendReferenceCorpusService.recordDraftRemixLineage({
      brandId: input.brandId,
      contentDraftId: (createdDraft as Record<string, unknown>).id as string,
      draftType: input.type,
      generatedBy: input.generatedBy,
      metadata: input.metadata,
      organizationId: input.organizationId,
      platforms: input.platforms ?? [],
      prompt: input.content,
    });

    return createdDraft as ContentDraftDocument;
  }

  async approve(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<ContentDraftDocument> {
    const existing = await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentDraft', id);
    }

    const updated = await this.delegate.update({
      where: { id },
      data: {
        approvedBy: userId,
        status: ContentDraftStatus.APPROVED,
      },
    });

    return updated as ContentDraftDocument;
  }

  async reject(
    id: string,
    organizationId: string,
    reason?: string,
  ): Promise<ContentDraftDocument> {
    const existing = await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentDraft', id);
    }

    const updateData: Record<string, unknown> = {
      status: ContentDraftStatus.REJECTED,
    };

    if (reason) {
      const currentMeta =
        ((existing as Record<string, unknown>).metadata as Record<
          string,
          unknown
        >) ?? {};
      updateData.metadata = { ...currentMeta, rejectionReason: reason };
    }

    const updated = await this.delegate.update({
      where: { id },
      data: updateData,
    });

    return updated as ContentDraftDocument;
  }

  async bulkApprove(
    ids: string[],
    organizationId: string,
    userId: string,
  ): Promise<{ modifiedCount: number }> {
    if (ids.length === 0) {
      return { modifiedCount: 0 };
    }

    const result = (await this.delegate.updateMany({
      where: {
        id: { in: ids },
        isDeleted: false,
        organizationId,
      },
      data: {
        approvedBy: userId,
        status: ContentDraftStatus.APPROVED,
      },
    })) as { count: number };

    return { modifiedCount: result.count };
  }

  async editDraft(
    id: string,
    organizationId: string,
    content: string,
  ): Promise<ContentDraftDocument> {
    const existing = await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentDraft', id);
    }

    const updated = await this.delegate.update({
      where: { id },
      data: { content },
    });

    return updated as ContentDraftDocument;
  }

  async autoPublishAboveThreshold(
    organizationId: string,
    brandId: string,
    threshold: number,
  ): Promise<{ modifiedCount: number }> {
    const result = (await this.delegate.updateMany({
      where: {
        brandId,
        confidence: { gte: threshold },
        isDeleted: false,
        organizationId,
        status: ContentDraftStatus.PENDING,
      },
      data: { status: ContentDraftStatus.APPROVED },
    })) as { count: number };

    return { modifiedCount: result.count };
  }
}
