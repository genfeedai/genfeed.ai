import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export const MODEL_REGISTRY_STATUSES = [
  'approved',
  'discovered',
  'legacy',
  'pending',
  'rejected',
] as const;

export type ModelRegistryStatus = (typeof MODEL_REGISTRY_STATUSES)[number];

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
  @IsEntityId()
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

  @ApiProperty({
    description: 'Filter by provider registry review status',
    enum: MODEL_REGISTRY_STATUSES,
    required: false,
  })
  @IsOptional()
  @IsIn(MODEL_REGISTRY_STATUSES)
  registryStatus?: ModelRegistryStatus;
}
