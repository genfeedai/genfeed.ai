import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { OrganizationCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The user ID who owns this organization',
    required: true,
  })
  readonly user!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The display name of the organization',
    required: true,
  })
  readonly label!: string;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this organization is currently selected',
    required: true,
  })
  readonly isSelected!: boolean;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/, {
    message: 'Prefix must be exactly 3 uppercase letters (A-Z)',
  })
  @ApiProperty({
    description:
      'Unique 3-letter uppercase prefix for issue identifiers (e.g., GEN)',
    example: 'GEN',
    maxLength: 3,
    minLength: 3,
    pattern: '^[A-Z]{3}$',
    required: false,
  })
  readonly prefix?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(48)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message:
      'Slug must be lowercase alphanumeric with hyphens, starting and ending with a letter or number',
  })
  @ApiProperty({
    description:
      'URL-friendly slug for the organization (auto-generated from label if not provided)',
    example: 'genfeed-ai',
    maxLength: 48,
    minLength: 2,
    required: false,
  })
  readonly slug?: string;

  @IsEnum(OrganizationCategory)
  @IsOptional()
  @ApiProperty({
    default: OrganizationCategory.BUSINESS,
    description:
      'The category of the organization (creator, business, or agency)',
    enum: OrganizationCategory,
    enumName: 'OrganizationCategory',
    required: false,
  })
  readonly category?: OrganizationCategory;

  @IsEnum(OrganizationCategory)
  @IsOptional()
  @ApiProperty({
    description:
      'Account type selected during onboarding (creator, business, or agency)',
    enum: OrganizationCategory,
    enumName: 'OrganizationCategory',
    required: false,
  })
  readonly accountType?: OrganizationCategory;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether onboarding has been completed for this organization',
    required: false,
  })
  readonly onboardingCompleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether this organization is a proactive onboarding shadow workspace',
    required: false,
  })
  readonly isProactiveOnboarding?: boolean;
}
