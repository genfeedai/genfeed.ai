import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateBookmarkDto extends PartialType(CreateBookmarkDto) {
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
