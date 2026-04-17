import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import type { TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
