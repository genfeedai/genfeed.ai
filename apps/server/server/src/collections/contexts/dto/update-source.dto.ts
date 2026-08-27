import { AddSourceDto } from '@server/collections/contexts/dto/add-source.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateSourceDto extends PartialType(AddSourceDto) {}
