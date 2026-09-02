import { AddSourceDto } from '@api/collections/contexts/dto/add-source.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateSourceDto extends PartialType(AddSourceDto) {}
