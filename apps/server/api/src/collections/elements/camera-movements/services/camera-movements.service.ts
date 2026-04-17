import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import type { ElementCameraMovementDocument } from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsCameraMovementsService extends BaseService<
  ElementCameraMovementDocument,
  CreateElementCameraMovementDto,
  UpdateElementCameraMovementDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'elementCameraMovement', logger);
  }
}
