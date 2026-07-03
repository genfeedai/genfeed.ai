import type { CreateMoodBoardDto } from '@api/collections/mood-boards/dto/create-mood-board.dto';
import type { UpdateMoodBoardDto } from '@api/collections/mood-boards/dto/update-mood-board.dto';
import type { MoodBoardDocument } from '@api/collections/mood-boards/schemas/mood-board.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

  async findOrCreateByBrand(
    brandId: string,
    organizationId: string,
  ): Promise<MoodBoardDocument> {
    // Scope the brand lookup to the caller's organization so a user from one
    // org cannot read (or upsert-create) the mood board of a brand owned by
    // another org. Mirrors the org-scoping the PATCH handler already applies.
    const brand = await this.prisma.brand.findFirst({
      select: { organizationId: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const record = await this.prisma.moodBoard.upsert({
      create: {
        brandId,
        layout: [],
        organizationId: brand.organizationId,
      },
      update: {},
      where: { brandId },
    });

    return record as MoodBoardDocument;
  }
}
