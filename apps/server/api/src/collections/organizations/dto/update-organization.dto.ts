import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationCategory } from '@genfeedai/enums';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

// Prefix is immutable once set — exclude from update DTO
export class UpdateOrganizationDto extends PartialType(
  OmitType(CreateOrganizationDto, ['prefix'] as const),
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the organization is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

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
    description: 'Whether onboarding has been completed for this organization',
    required: false,
  })
  readonly onboardingCompleted?: boolean;
}
