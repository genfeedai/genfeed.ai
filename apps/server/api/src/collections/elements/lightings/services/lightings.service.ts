import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';
import type { ElementLightingDocument } from '@api/collections/elements/lightings/schemas/lighting.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsLightingsService extends BaseService<
  ElementLightingDocument,
  CreateElementLightingDto,
  UpdateElementLightingDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
