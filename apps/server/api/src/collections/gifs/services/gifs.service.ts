import type { GIFDocument } from '@api/collections/gifs/schemas/gif.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class GifsService extends IngredientsService {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    protected readonly moduleRef: ModuleRef,
  ) {
    super(prisma, logger, moduleRef);
  }
}
