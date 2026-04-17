import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';
import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';
import type { ElementStyleDocument } from '@api/collections/elements/styles/schemas/style.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsStylesService extends BaseService<
  ElementStyleDocument,
  CreateElementStyleDto,
  UpdateElementStyleDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
