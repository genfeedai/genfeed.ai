import { CreateTagDto } from '@server/collections/tags/dto/create-tag.dto';
import { UpdateTagDto } from '@server/collections/tags/dto/update-tag.dto';
import type { TagDocument } from '@server/collections/tags/schemas/tag.schema';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
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
    super(prisma, 'tag', logger);
  }
}
