import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { toBooleanDefaultFalse } from '@api/helpers/dto/optional-boolean.transform';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class GifsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by parent GIF ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  parentId?: string;

  @ApiProperty({
    description:
      'Filter by status using repeated query keys (e.g., ?status=completed&status=failed). ' +
      'Defaults to ["draft", "uploaded", "completed"] when not specified.',
    example: ['completed', 'failed'],
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
    description: 'Filter by scope/visibility level',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  declare brandId?: string;

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

  @ApiProperty({
    description: 'Search GIFs by text',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by folder ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  folderId?: string;

  @ApiProperty({
    default: false,
    description:
      'Use lightweight mode (skip expensive lookups for gallery views)',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(toBooleanDefaultFalse)
  lightweight?: boolean;
}
