import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SoundsQueryDto extends BaseQueryDto {
  @IsEnum(ModelCategory)
  @IsNotEmpty()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by sound category',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  category?: ModelCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Search by value (partial match)',
    required: false,
  })
  value?: string;
}
