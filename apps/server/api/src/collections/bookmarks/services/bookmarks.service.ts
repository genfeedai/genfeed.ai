import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import type { Bookmark } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BookmarksService extends BaseService<
  Bookmark,
  CreateBookmarkDto,
  UpdateBookmarkDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'bookmark', logger);
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
