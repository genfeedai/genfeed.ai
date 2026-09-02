import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * CSV import is a file-derived bulk path, so it is deliberately larger than the
 * hand-keyed manual flow. The bound is doubly load-bearing in
 * content-performance.service.ts `importCsv`: entry count drives both the
 * `OR` clause count of the single post-matching `findMany` and the `Promise.all`
 * create fan-out. Larger files are chunked client-side.
 */
const MAX_CSV_ENTRIES = 200;

export class CsvMetricEntryDto {
  @ApiProperty({
    description: 'External post ID from the platform',
    required: true,
  })
  @IsString()
  externalPostId!: string;

  @ApiProperty({
    description: 'Platform',
    enum: CredentialPlatform,
    required: true,
  })
  @IsEnum(CredentialPlatform)
  platform!: CredentialPlatform;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  views?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  likes?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  comments?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shares?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  saves?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenue?: number;

  @ApiProperty({
    description: 'Date when metrics were measured',
    required: true,
  })
  @IsDateString()
  measuredAt!: string;
}

export class ImportCsvDto {
  @ApiProperty({
    description: 'Brand ID to associate with unmatched entries',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description: 'Array of CSV metric entries',
    maxItems: MAX_CSV_ENTRIES,
    type: [CsvMetricEntryDto],
  })
  @IsArray()
  @ArrayMaxSize(MAX_CSV_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => CsvMetricEntryDto)
  entries!: CsvMetricEntryDto[];
}
