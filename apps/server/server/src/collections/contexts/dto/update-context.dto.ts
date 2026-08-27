import { CreateContextDto } from '@server/collections/contexts/dto/create-context.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateContextDto extends PartialType(CreateContextDto) {}
