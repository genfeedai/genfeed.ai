import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import type { ElementSoundDocument } from '@api/collections/elements/sounds/schemas/sound.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsSoundsService extends BaseService<
  ElementSoundDocument,
  CreateElementSoundDto,
  UpdateElementSoundDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
