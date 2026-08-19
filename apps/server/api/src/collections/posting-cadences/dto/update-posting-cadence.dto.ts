import { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdatePostingCadenceDto extends PartialType(
  CreatePostingCadenceDto,
) {}
