import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContextsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Only context bases in this category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';

  @ApiPropertyOptional({ description: 'Case-insensitive label search' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
