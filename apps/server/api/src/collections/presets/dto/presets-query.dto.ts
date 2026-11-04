import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { toBooleanOrUnset } from '@api/helpers/dto/optional-boolean.transform';
import { ModelCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class PresetsQueryDto extends BaseQueryDto {
  @IsEnum(ModelCategory)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by preset category',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  category?: ModelCategory;

  @ApiProperty({ description: 'Filter by active status', required: false })
  @IsOptional()
  @ValidateIf((o) => o.isActive !== undefined)
  @Transform(toBooleanOrUnset)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Filter by favorite status', required: false })
  @IsOptional()
  @ValidateIf((o) => o.isFavorite !== undefined)
  @Transform(toBooleanOrUnset)
  @IsBoolean()
  isFavorite?: boolean;

  @ApiProperty({
    description: 'Search presets by label, key or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
