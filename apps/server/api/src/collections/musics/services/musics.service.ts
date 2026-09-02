import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MusicsService extends BaseService<
  MusicDocument,
  CreateMusicDto,
  UpdateMusicDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly ingredientsService: IngredientsService,
  ) {
    super(prisma, 'ingredient', logger);
  }

  override async create(
    createDto: CreateMusicDto,
    populate?: PopulateInput,
  ): Promise<MusicDocument> {
    // The DTO cast stays — music and ingredient create DTOs differ. The return
    // value does not: both services resolve the same `IngredientDocument`.
    return this.ingredientsService.create(
      createDto as unknown as Parameters<IngredientsService['create']>[0],
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateMusicDto> | Record<string, unknown>,
    populate: PopulateInput = [],
  ): Promise<MusicDocument> {
    return this.ingredientsService.patch(
      id,
      updateDto as Parameters<IngredientsService['patch']>[1],
      populate,
    );
  }

  override async patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    return this.ingredientsService.patchAll(filter, update);
  }
}
