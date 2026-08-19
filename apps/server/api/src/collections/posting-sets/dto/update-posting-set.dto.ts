import { CreatePostingSetDto } from '@api/collections/posting-sets/dto/create-posting-set.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdatePostingSetDto extends PartialType(CreatePostingSetDto) {}
