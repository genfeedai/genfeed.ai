import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * DTO for initiating brand setup from URL
 */
export class BrandSetupDto {
  @IsUrl(
    { require_protocol: false },
    { message: 'Please provide a valid website URL' },
  )
  @MaxLength(500)
  @ApiProperty({
    description: 'The brand website URL to analyze',
    example: 'https://example.com',
  })
  brandUrl!: string;

  @IsUrl(
    { require_protocol: false },
    { message: 'Please provide a valid LinkedIn URL' },
  )
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'LinkedIn company page URL',
    example: 'https://linkedin.com/company/example',
  })
  linkedinUrl?: string;

  @IsUrl(
    { require_protocol: false },
    { message: 'Please provide a valid X/Twitter URL' },
  )
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'X/Twitter profile URL',
    example: 'https://x.com/example',
  })
  xProfileUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiPropertyOptional({
    description: 'User-provided brand name',
    example: 'Acme Corp',
  })
  brandName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @ApiPropertyOptional({
    description: 'Industry/niche of the brand',
    example: 'Technology',
  })
  industry?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({
    description: 'Target audience description',
    example: 'B2B SaaS companies',
  })
  targetAudience?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  @ApiPropertyOptional({
    description: 'Additional notes or context about the brand',
  })
  additionalNotes?: string;
}

/**
 * DTO for confirming/editing extracted brand data
 */
export class ConfirmBrandDataDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiPropertyOptional({ description: 'Override company/brand name' })
  label?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({ description: 'Override brand description' })
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  @ApiPropertyOptional({
    description: 'Override primary color (hex)',
    example: '#2563EB',
  })
  primaryColor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  @ApiPropertyOptional({
    description: 'Override secondary color (hex)',
    example: '#1E40AF',
  })
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Override font family' })
  fontFamily?: string;

  @IsUrl({ require_protocol: false }, { message: 'Invalid logo URL' })
  @IsOptional()
  @ApiPropertyOptional({ description: 'Override logo URL' })
  logoUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Override brand tone' })
  tone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Override brand voice' })
  voice?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Override target audience' })
  audience?: string;
}

/**
 * DTO for updating brand name without scanning
 */
export class UpdateBrandNameDto {
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Brand name to set',
    example: 'Acme Corp',
  })
  brandName!: string;
}

/**
 * DTO for skipping onboarding
 */
export class SkipOnboardingDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({ description: 'Reason for skipping (optional)' })
  reason?: string;
}
