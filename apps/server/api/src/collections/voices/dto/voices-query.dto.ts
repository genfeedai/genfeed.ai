import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { toBooleanOrUnset } from '@api/helpers/dto/optional-boolean.transform';
import { AssetScope, VoiceProvider } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class VoicesQueryDto extends BaseQueryDto {
  @ApiProperty({
    description:
      'Filter voices by status using repeated query keys (e.g., ?status=generated&status=processing).',
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
    description: 'Filter by default voice status',
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @ValidateIf((o) => o.isDefault !== undefined)
  @Transform(toBooleanOrUnset)
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
      'Filter voices by providers using repeated query keys or comma-separated values.',
    enum: VoiceProvider,
    enumName: 'VoiceProvider',
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [String(item)],
      )
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsOptional()
  @IsArray()
  @IsEnum(VoiceProvider, { each: true })
  providers?: VoiceProvider[];

  @ApiProperty({
    description: 'Search voices by label or external voice ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter library voices by activation state',
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @ValidateIf((o) => o.isActive !== undefined)
  @Transform(toBooleanOrUnset)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description:
      'Filter by canonical voice source (catalog, cloned, generated, imported).',
    enum: ['catalog', 'cloned', 'generated', 'imported'],
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [String(item)],
      )
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsOptional()
  @IsArray()
  @IsIn(['catalog', 'cloned', 'generated', 'imported'], { each: true })
  voiceSource?: Array<'catalog' | 'cloned' | 'generated' | 'imported'>;
}
