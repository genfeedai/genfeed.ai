import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateElementCameraMovementDto extends PartialType(
  CreateElementCameraMovementDto,
) {}
