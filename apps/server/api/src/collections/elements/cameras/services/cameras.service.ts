import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';
import {
  ElementCamera,
  type ElementCameraDocument,
} from '@api/collections/elements/cameras/schemas/camera.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsCamerasService extends BaseService<
  ElementCameraDocument,
  CreateElementCameraDto,
  UpdateElementCameraDto
> {
  constructor(
    @InjectModel(ElementCamera.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementCameraDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
