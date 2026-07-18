import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { IngredientStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
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
    populate: (string | PopulateOption)[] | 'none' = [],
  ): Promise<MusicDocument> {
    if (createDto.status === IngredientStatus.GENERATED) {
      return this.ingredientsService.create(
        createDto as unknown as Parameters<IngredientsService['create']>[0],
      ) as Promise<MusicDocument>;
    }

    return super.create(createDto, populate);
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateMusicDto> | Record<string, unknown>,
    populate: (string | PopulateOption)[] | 'none' = [],
  ): Promise<MusicDocument> {
    if (updateDto.status === IngredientStatus.GENERATED) {
      return this.ingredientsService.patch(
        id,
        updateDto as Parameters<IngredientsService['patch']>[1],
      ) as Promise<MusicDocument>;
    }

    return super.patch(id, updateDto, populate);
  }

  override async patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    if (update.status === IngredientStatus.GENERATED) {
      return this.ingredientsService.patchAll(filter, update);
    }

    return super.patchAll(filter, update);
  }
}
