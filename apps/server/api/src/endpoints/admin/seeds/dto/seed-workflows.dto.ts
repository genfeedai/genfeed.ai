import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Dry run is the default. A live run must narrow to one brand or organization,
 * or opt in to every brand with `allBrands`.
 */
export class SeedWorkflowsDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  brandId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  organizationId?: string;

  @ApiProperty({
    description: 'Required for a live run without a brand or org',
  })
  @IsBoolean()
  @IsOptional()
  allBrands?: boolean;
}
