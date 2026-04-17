import type { ImageDocument } from '@api/collections/images/schemas/image.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ImagesService extends IngredientsService {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'ingredient', logger);
  }
}
