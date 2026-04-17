import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import type { LinkDocument } from '@api/collections/links/schemas/link.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LinksService extends BaseService<
  LinkDocument,
  CreateLinkDto,
  UpdateLinkDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
