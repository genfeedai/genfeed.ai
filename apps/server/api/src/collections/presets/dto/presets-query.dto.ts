import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';

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
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return undefined;
    }
    return value ? true : undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Filter by favorite status', required: false })
  @IsOptional()
  @ValidateIf((o) => o.isFavorite !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return undefined;
    }
    return value ? true : undefined;
  })
  @IsBoolean()
  isFavorite?: boolean;
}
