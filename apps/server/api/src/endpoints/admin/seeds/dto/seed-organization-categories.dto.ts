import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Dry run is the default. Excluded organizations are never touched. */
export class SeedOrganizationCategoriesDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiProperty({
    description: 'Organizations to leave as they are',
    required: false,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  excludeOrganizationIds?: string[];
}
