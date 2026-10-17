import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Dry run is the default. A live run must name the owner and the review brand,
 * the same rule the production CLI seed enforces, so the public articles never
 * land in an arbitrary tenant.
 */
export class SeedArticlesDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiProperty({ description: 'Email of the user who owns the publishing org' })
  @IsEmail()
  @IsOptional()
  ownerEmail?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  organizationId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  organizationLabel?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  brandId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  brandSlug?: string;
}
