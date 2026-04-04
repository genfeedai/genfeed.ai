import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class MusicQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search term for filtering results',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Brand ID for filtering',
    required: false,
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    description: 'Filter by default status',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isDefault !== undefined)
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false || value === '0' || value === 0) {
      return false;
    }
    return value ? true : undefined;
  })
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({
    description: 'Filter by scope/visibility level',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description:
      'Filter by status using repeated query keys (e.g., ?status=generated&status=processing).',
    required: false,
    type: [String],
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @ApiProperty({
    description: 'Filter by format',
    required: false,
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty({
    description: 'Filter by provider',
    required: false,
  })
  @IsOptional()
  @IsString()
  provider?: string;
}
