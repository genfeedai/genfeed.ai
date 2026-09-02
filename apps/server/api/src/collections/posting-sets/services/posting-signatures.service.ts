import type { CreatePostingSignatureDto } from '@api/collections/posting-sets/dto/create-posting-signature.dto';
import type { PostingSignaturesQueryDto } from '@api/collections/posting-sets/dto/posting-signatures-query.dto';
import type { UpdatePostingSignatureDto } from '@api/collections/posting-sets/dto/update-posting-signature.dto';
import type { PostingSignatureDocument } from '@api/collections/posting-sets/schemas/posting-set.schema';
import {
  parseCreatePostingSignatureInput,
  parseStoredPlacement,
  parseStoredPlatforms,
  parseUpdatePostingSignatureInput,
  type StoredPostingSignatureRow,
  toPostingSignatureInput,
} from '@api/collections/posting-sets/services/posting-set-persistence.helpers';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IPostingSetScope } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class PostingSignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async createScoped(
    dto: CreatePostingSignatureDto,
    context: IPostingSetScope,
  ): Promise<PostingSignatureDocument> {
    const input = parseCreatePostingSignatureInput(dto);
    const created = await this.delegate().create({
      data: {
        body: input.body,
        brandId: input.brandId ?? context.brandId ?? null,
        isEnabled: input.isEnabled ?? true,
        label: input.label,
        organizationId: context.organizationId,
        placement: input.placement ?? 'append',
        platforms: input.platforms,
        userId: context.userId,
      },
    });
    return this.toDocument(created);
  }

  async findAllScoped(
    context: IPostingSetScope,
    query: PostingSignaturesQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const where = scopedWhere(context.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
      ...(query.label ? { label: query.label } : {}),
      ...(query.platform ? { platforms: { has: query.platform } } : {}),
    });
    const [docs, total] = await Promise.all([
      this.delegate().findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.delegate().count({ where }),
    ]);

    return {
      docs: docs.map((row) => this.toDocument(row)),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: IPostingSetScope,
  ): Promise<PostingSignatureDocument> {
    return this.requireSignature(id, context);
  }

  async updateScoped(
    id: string,
    dto: UpdatePostingSignatureDto,
    context: IPostingSetScope,
  ): Promise<PostingSignatureDocument> {
    const existing = await this.requireSignatureRow(id, context);
    const input = parseUpdatePostingSignatureInput(dto);
    const updated = await this.delegate().update({
      data: {
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
        ...(input.isEnabled === undefined
          ? {}
          : { isEnabled: input.isEnabled }),
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.placement === undefined
          ? {}
          : { placement: input.placement }),
        ...(input.platforms === undefined
          ? {}
          : { platforms: input.platforms }),
      },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
    return this.toDocument(updated);
  }

  async removeScoped(id: string, context: IPostingSetScope): Promise<void> {
    const existing = await this.requireSignatureRow(id, context);
    await this.delegate().update({
      data: { isDeleted: true },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
  }

  async findByIdsScoped(
    ids: readonly string[],
    organizationId: string,
  ): Promise<PostingSignatureDocument[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.delegate().findMany({
      where: scopedWhere(organizationId, {
        id: { in: [...ids] },
      }),
    });
    return rows.map((row) => this.toDocument(row));
  }

  private async requireSignature(
    id: string,
    context: IPostingSetScope,
  ): Promise<PostingSignatureDocument> {
    return this.toDocument(await this.requireSignatureRow(id, context));
  }

  private async requireSignatureRow(
    id: string,
    context: IPostingSetScope,
  ): Promise<StoredPostingSignatureRow> {
    this.assertOrganization(context.organizationId);
    const row = await this.delegate().findFirst({
      where: scopedWhere(context.organizationId, { id }),
    });
    if (!row) {
      throw new NotFoundException('Posting signature', id);
    }
    return row as StoredPostingSignatureRow;
  }

  private toDocument(row: StoredPostingSignatureRow): PostingSignatureDocument {
    const input = toPostingSignatureInput(row);
    return {
      body: input.body,
      brandId: row.brandId,
      createdAt: row.createdAt,
      id: row.id,
      isDeleted: row.isDeleted,
      isEnabled: input.isEnabled ?? true,
      label: input.label,
      organizationId: row.organizationId,
      placement: parseStoredPlacement(row.placement),
      platforms: parseStoredPlatforms(row.platforms),
      updatedAt: row.updatedAt,
      userId: row.userId,
    };
  }

  private assertOrganization(organizationId: string): void {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }
  }

  private delegate() {
    return this.prisma.postingSignature;
  }
}
