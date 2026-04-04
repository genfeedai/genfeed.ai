import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import {
  ElementCameraMovement,
  type ElementCameraMovementDocument,
} from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsCameraMovementsService extends BaseService<
  ElementCameraMovementDocument,
  CreateElementCameraMovementDto,
  UpdateElementCameraMovementDto
> {
  constructor(
    @InjectModel(ElementCameraMovement.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementCameraMovementDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
