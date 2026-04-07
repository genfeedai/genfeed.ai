import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import { Bookmark } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class BookmarksService extends BaseService<
  Bookmark,
  CreateBookmarkDto,
  UpdateBookmarkDto
> {
  constructor(
    @InjectModel(Bookmark.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<Bookmark>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Add a generated ingredient to a bookmark's tracking
   */
  @HandleErrors('add generated ingredient', 'bookmarks')
  async addGeneratedIngredient(
    bookmarkId: string | Types.ObjectId,
    ingredientId: string | Types.ObjectId,
  ): Promise<Bookmark | null> {
    this.logOperation('addGeneratedIngredient', 'started', {
      bookmarkId,
      ingredientId,
    });

    const result = await this.model.findByIdAndUpdate(
      bookmarkId,
      {
        $addToSet: { generatedIngredients: ingredientId },
        $set: { processedAt: new Date() },
      },
      { returnDocument: 'after' },
    );

    this.logOperation('addGeneratedIngredient', 'completed', {
      bookmarkId,
      ingredientId,
    });

    return result;
  }

  extractMetadata(_url: string): Record<string, string | number> {
    return {};
  }
}
