import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import type { TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { resolveTagScope, type TagCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Most tags the Library picker lists in one response. */
export const LIBRARY_TAG_LIST_LIMIT = 500;

export interface TagVisibilityScope {
  /** The active brand. Without one only organization-wide tags are visible. */
  brandId?: string | null;
  organizationId: string;
}

export interface CreateScopedTagInput {
  backgroundColor?: string;
  brandId: string | null;
  category?: TagCategory;
  description?: string;
  key?: string;
  label: string;
  organizationId: string;
  textColor?: string;
  userId: string;
}

@Injectable()
export class TagsService extends BaseService<
  TagDocument,
  CreateTagDto,
  UpdateTagDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'tag', logger);
  }

  /**
   * The tags a brand can use (#6011): its own brand tags, the organization-wide
   * tags, and the legacy default tags (no organization), each with how many of
   * the brand's assets carry it. Another brand's tags never appear.
   */
  async listLibraryTags(
    scope: TagVisibilityScope,
    search?: string,
  ): Promise<TagDocument[]> {
    const { brandId, organizationId } = scope;

    const rows = await this.prisma.tag.findMany({
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
      select: {
        _count: {
          select: {
            ingredients: {
              where: {
                brandId: brandId ?? undefined,
                isDeleted: false,
                organizationId,
              },
            },
          },
        },
        backgroundColor: true,
        brandId: true,
        category: true,
        description: true,
        id: true,
        isActive: true,
        key: true,
        label: true,
        organizationId: true,
        textColor: true,
        userId: true,
      },
      take: LIBRARY_TAG_LIST_LIMIT,
      where: {
        isDeleted: false,
        label: search ? { contains: search, mode: 'insensitive' } : undefined,
        OR: [
          { brandId: null, organizationId },
          { brandId: { in: brandId ? [brandId] : [] }, organizationId },
          { brandId: null, organizationId: null, userId: null },
        ],
      },
    });

    return rows.map(({ _count, ...row }) => ({
      ...row,
      assetCount: _count.ingredients,
      scope: resolveTagScope(row),
    })) as unknown as TagDocument[];
  }

  /**
   * The existing tag with this label in exactly this scope (`brandId` null is
   * the organization-wide scope), compared case-insensitively.
   */
  async findByLabelInScope(params: {
    brandId: string | null;
    label: string;
    organizationId: string;
  }): Promise<TagDocument | null> {
    const { brandId, label, organizationId } = params;

    const row = await this.prisma.tag.findFirst({
      orderBy: { createdAt: 'asc' },
      where: {
        brandId,
        isDeleted: false,
        label: { equals: label, mode: 'insensitive' },
        organizationId,
      },
    });

    return row ? (this.normalizeDocument(row) as TagDocument) : null;
  }

  async createInScope(input: CreateScopedTagInput): Promise<TagDocument> {
    const row = await this.prisma.tag.create({
      data: {
        backgroundColor: input.backgroundColor,
        brandId: input.brandId,
        category: input.category,
        description: input.description,
        key: input.key,
        label: input.label,
        organizationId: input.organizationId,
        textColor: input.textColor,
        userId: input.userId,
      },
    });

    return this.normalizeDocument(row) as TagDocument;
  }

  /**
   * Delete a tag: it leaves every asset it was on and is soft deleted. The
   * assets themselves are untouched.
   */
  async removeDetachingAssets(
    id: string,
    organizationId: string,
  ): Promise<TagDocument | null> {
    const row = await this.prisma.tag.update({
      data: { ingredients: { set: [] }, isDeleted: true },
      where: { id, isDeleted: false, organizationId },
    });

    return row ? (this.normalizeDocument(row) as TagDocument) : null;
  }
}
