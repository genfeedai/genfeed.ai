import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBatchProjectItemDto {
  @ApiPropertyOptional({ description: 'Post caption for this item' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly caption?: string;
}
