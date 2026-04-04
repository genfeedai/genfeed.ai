import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateElementLensDto extends PartialType(CreateElementLensDto) {}
