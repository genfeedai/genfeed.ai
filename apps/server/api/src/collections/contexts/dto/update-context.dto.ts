import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateContextDto extends PartialType(CreateContextDto) {}
