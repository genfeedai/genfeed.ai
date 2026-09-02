import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class BlacklistsQueryDto extends BaseQueryDto {
  @IsEnum(ModelCategory)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by blacklist category',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  category?: ModelCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Search by value (searches in label and description)',
    required: false,
  })
  value?: string;
}
