import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateElementLightingDto extends PartialType(
  CreateElementLightingDto,
) {}
