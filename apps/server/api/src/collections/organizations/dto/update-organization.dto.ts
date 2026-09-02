import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationCategory } from '@genfeedai/enums';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

// `prefix` is inherited from CreateOrganizationDto. It is immutable once set —
// that guard (plus uniqueness) is enforced at runtime in
// OrganizationsService.patch(), not via DTO-level field exclusion, since the
// generic PATCH /organizations/:id route is also how a prefix gets set
// (REST audit #1354 — folded from the removed POST /onboarding/prefix route).
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {
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

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description:
      'Whether this organization is a proactive onboarding shadow workspace',
    required: false,
  })
  readonly isProactiveOnboarding?: boolean;
}
