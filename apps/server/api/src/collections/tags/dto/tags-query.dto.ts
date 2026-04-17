import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { TagCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export class TagsQueryDto extends BaseQueryDto {
  @IsEnum(TagCategory)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by tag category',
    enum: TagCategory,
    enumName: 'TagCategory',
    required: false,
  })
  readonly category?: TagCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by tag label (partial match)',
    required: false,
  })
  readonly label?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  readonly brand?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Search across label, key, description, and category fields',
    required: false,
  })
  readonly search?: string;
}
