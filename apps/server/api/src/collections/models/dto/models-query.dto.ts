import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  ValidateIf,
} from 'class-validator';

/**
 * Query DTO for filtering and paginating models
 * Inherits pagination, sorting, and common filters from BaseQueryDto
 */
export class ModelsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by model category',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(ModelCategory)
  category?: ModelCategory | 'other';

  @ApiProperty({
    description:
      'Filter by organization - only return models enabled for this organization',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @ApiProperty({
    description: 'Filter by active status',
    required: false,
  })
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
}
