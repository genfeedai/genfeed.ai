import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import type { Bookmark } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const BOOKMARK_CREATE_SCALAR_FIELDS = [
  'author',
  'authorHandle',
  'brandId',
  'category',
  'content',
  'description',
  'folderId',
  'intent',
  'mediaUrls',
  'organizationId',
  'platform',
  'platformData',
  'savedAt',
  'thumbnailUrl',
  'title',
  'url',
  'userId',
] as const;

const BOOKMARK_UPDATE_SCALAR_FIELDS = [
  'author',
  'authorHandle',
  'brandId',
  'category',
  'content',
  'description',
  'folderId',
  'intent',
  'isDeleted',
  'mediaUrls',
  'platform',
  'platformData',
  'thumbnailUrl',
  'title',
  'url',
] as const;

type BookmarkOwnershipInput = {
  organizationId: string;
  savedAt?: Date;
  userId: string;
};

type BookmarkCreateInput = CreateBookmarkDto & BookmarkOwnershipInput;

@Injectable()
export class BookmarksService extends BaseService<
  Bookmark,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  Prisma.BookmarkWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'bookmark', logger);
  }

  override create(
    input: BookmarkCreateInput,
    populate: (string | PopulateOption)[] = [],
  ): Promise<Bookmark> {
    return super.create(
      {
        ...pickDefinedFields(input, BOOKMARK_CREATE_SCALAR_FIELDS),
        ...(input.tagIds
          ? { tags: { connect: input.tagIds.map((id) => ({ id })) } }
          : {}),
      } as unknown as CreateBookmarkDto,
      populate,
    );
  }

  override patch(
    id: string,
    input: UpdateBookmarkDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<Bookmark> {
    return super.patch(
      id,
      {
        ...pickDefinedFields(input, BOOKMARK_UPDATE_SCALAR_FIELDS),
        ...(input.tagIds
          ? { tags: { set: input.tagIds.map((tagId) => ({ id: tagId })) } }
          : {}),
      } as unknown as UpdateBookmarkDto,
      populate,
    );
  }

  /**
   * Add a generated ingredient to a bookmark's tracking
   */
  @HandleErrors('add generated ingredient', 'bookmarks')
  async addGeneratedIngredient(
    bookmarkId: string,
    ingredientId: string,
  ): Promise<Bookmark | null> {
    this.logOperation('addGeneratedIngredient', 'started', {
      bookmarkId,
      ingredientId,
    });

    const bookmark = await this.delegate.findFirst({
      where: { id: bookmarkId, isDeleted: false },
    });

    if (!bookmark) {
      return null;
    }

    const result = await this.delegate.update({
      where: { id: bookmarkId },
      data: {
        generatedIngredients: { connect: { id: ingredientId } },
        processedAt: new Date(),
      },
    });

    this.logOperation('addGeneratedIngredient', 'completed', {
      bookmarkId,
      ingredientId,
    });

    return result as Bookmark;
  }

  extractMetadata(_url: string): Record<string, string | number> {
    return {};
  }
}
