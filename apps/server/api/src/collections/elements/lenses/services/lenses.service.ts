import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import type { ElementLensDocument } from '@api/collections/elements/lenses/schemas/lens.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsLensesService extends BaseService<
  ElementLensDocument,
  CreateElementLensDto,
  UpdateElementLensDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'elementLens', logger);
  }
}
