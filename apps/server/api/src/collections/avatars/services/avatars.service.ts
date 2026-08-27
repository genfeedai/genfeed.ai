import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class AvatarsService extends IngredientsService {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    protected readonly moduleRef: ModuleRef,
  ) {
    super(prisma, logger, moduleRef);
  }
}
