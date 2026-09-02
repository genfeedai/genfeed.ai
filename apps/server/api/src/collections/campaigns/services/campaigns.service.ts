import type { CampaignPostsDto } from '@api/collections/campaigns/dto/campaign-action.dto';
import type { CampaignsQueryDto } from '@api/collections/campaigns/dto/campaigns-query.dto';
import type { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import type { UpdateCampaignDto } from '@api/collections/campaigns/dto/update-campaign.dto';
import { toCampaign } from '@api/collections/campaigns/services/campaign.utils';
import { ContentCampaignStatus } from '@genfeedai/enums';
import type { ICampaign } from '@genfeedai/interfaces';
import type { Campaign } from '@genfeedai/prisma';
import { type AggregatePaginateResult, scopedWhere } from '@genfeedai/server';
import { BadRequestException, Injectable } from '@nestjs/common';
import { isPrismaUniqueConstraintError } from '@server/collections/shared/slug-allocation.util';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: CampaignsQueryDto,
  ): Promise<AggregatePaginateResult<ICampaign>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = scopedWhere(organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    });

    const [rows, totalDocs] = await Promise.all([
      this.prisma.campaign.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));

    return {
      docs: rows.map(toCampaign),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
      nextPage: page < totalPages ? page + 1 : null,
      page,
      pagingCounter: (page - 1) * limit + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  async getOne(organizationId: string, id: string): Promise<ICampaign> {
    return toCampaign(await this.requireCampaign(organizationId, id));
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateCampaignDto,
  ): Promise<ICampaign> {
    await this.assertBrand(organizationId, dto.brandId);

    const data = {
      brandId: dto.brandId,
      brief: dto.brief ?? null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      idempotencyKey: dto.idempotencyKey ?? null,
      isDeleted: false,
      name: dto.name,
      objective: dto.objective ?? null,
      organizationId,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      status: dto.status ?? ContentCampaignStatus.DRAFT,
      userId,
    };

    try {
      return toCampaign(await this.prisma.campaign.create({ data }));
    } catch (error: unknown) {
      if (!dto.idempotencyKey || !isPrismaUniqueConstraintError(error)) {
        throw error;
      }
      const winner = await this.prisma.campaign.findFirst({
        where: scopedWhere(organizationId, {
          idempotencyKey: dto.idempotencyKey,
        }),
      });
      if (!winner) {
        throw error;
      }
      return toCampaign(winner);
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<ICampaign> {
    const existing = await this.requireCampaign(organizationId, id);
    if (dto.brandId && dto.brandId !== existing.brandId) {
      await this.assertBrand(organizationId, dto.brandId);
    }

    const updated = await this.prisma.campaign.update({
      data: {
        ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
        ...(dto.brief !== undefined ? { brief: dto.brief ?? null } : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.objective !== undefined
          ? { objective: dto.objective ?? null }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      where: scopedWhere(organizationId, { id }),
    });
    return toCampaign(updated);
  }

  async archive(organizationId: string, id: string): Promise<ICampaign> {
    return this.setStatus(organizationId, id, ContentCampaignStatus.ARCHIVED);
  }

  async restore(
    organizationId: string,
    id: string,
    status?: ContentCampaignStatus,
  ): Promise<ICampaign> {
    return this.setStatus(
      organizationId,
      id,
      status ?? ContentCampaignStatus.DRAFT,
    );
  }

  /**
   * Soft delete only. Posts and post groups keep their `campaignId` — a
   * removed campaign never cascades into published or scheduled work.
   */
  async remove(organizationId: string, id: string): Promise<ICampaign> {
    await this.requireCampaign(organizationId, id);
    const removed = await this.prisma.campaign.update({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, { id }),
    });
    return toCampaign(removed);
  }

  async assignPosts(
    organizationId: string,
    id: string,
    dto: CampaignPostsDto,
  ): Promise<ICampaign> {
    const campaign = await this.requireCampaign(organizationId, id);
    await this.assertPostsInScope(
      organizationId,
      campaign.brandId,
      dto.postIds,
    );

    await this.prisma.post.updateMany({
      data: { campaignId: campaign.id },
      where: scopedWhere(organizationId, {
        brandId: campaign.brandId,
        id: { in: [...new Set(dto.postIds)] },
      }),
    });
    return toCampaign(campaign);
  }

  async unassignPosts(
    organizationId: string,
    id: string,
    dto: CampaignPostsDto,
  ): Promise<ICampaign> {
    const campaign = await this.requireCampaign(organizationId, id);
    await this.assertPostsInScope(
      organizationId,
      campaign.brandId,
      dto.postIds,
    );

    await this.prisma.post.updateMany({
      data: { campaignId: null },
      where: scopedWhere(organizationId, {
        brandId: campaign.brandId,
        campaignId: campaign.id,
        id: { in: [...new Set(dto.postIds)] },
      }),
    });
    return toCampaign(campaign);
  }

  private async setStatus(
    organizationId: string,
    id: string,
    status: ContentCampaignStatus,
  ): Promise<ICampaign> {
    await this.requireCampaign(organizationId, id);
    const updated = await this.prisma.campaign.update({
      data: { status },
      where: scopedWhere(organizationId, { id }),
    });
    return toCampaign(updated);
  }

  private async requireCampaign(
    organizationId: string,
    id: string,
  ): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }
    return campaign;
  }

  private async assertBrand(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
  }

  private async assertPostsInScope(
    organizationId: string,
    brandId: string,
    postIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(postIds)];
    const rows = await this.prisma.post.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, { brandId, id: { in: uniqueIds } }),
    });
    const found = new Set(rows.map((row) => row.id));
    const missing = uniqueIds.find((postId) => !found.has(postId));
    if (missing) {
      throw new BadRequestException(
        `Post '${missing}' is unavailable in this campaign's brand`,
      );
    }
  }
}
