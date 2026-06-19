import type { CreateMoodBoardDto } from '@api/collections/mood-boards/dto/create-mood-board.dto';
import type { UpdateMoodBoardDto } from '@api/collections/mood-boards/dto/update-mood-board.dto';
import type { MoodBoardDocument } from '@api/collections/mood-boards/schemas/mood-board.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class MoodBoardsService extends BaseService<
  MoodBoardDocument,
  CreateMoodBoardDto,
  UpdateMoodBoardDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'moodBoard', logger);
  }

  async findOrCreateByBrand(brandId: string): Promise<MoodBoardDocument> {
    const existing = await this.prisma.moodBoard.findFirst({
      where: { brandId, isDeleted: false },
    });

    if (existing) {
      return existing as MoodBoardDocument;
    }

    const brand = await this.prisma.brand.findFirst({
      select: { organizationId: true },
      where: { id: brandId, isDeleted: false },
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${brandId} not found`);
    }

    const created = await this.prisma.moodBoard.create({
      data: {
        brandId,
        layout: [],
        organizationId: brand.organizationId,
      },
    });

    return created as MoodBoardDocument;
  }
}
