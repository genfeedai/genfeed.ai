import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  BrandAgentConfig,
  BrandReferenceImage,
} from '@api/collections/brands/schemas/brand.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiHideProperty, ApiProperty, PartialType } from '@nestjs/swagger';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const BRAND_FINISHING_REVISION_MESSAGE =
  'End card, colour grade and watermark change through a Brand OS revision, not a brand update';

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  // End card, colour grade and watermark change only through a Brand OS
  // revision (#10187), so a change has a version and an approver. Approving the
  // revision writes these columns; a plain PATCH never does.
  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkText?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkLogoId?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkOpacity?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkPosition?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkLightLogoId?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkLiveLogoId?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkSizeRatio?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkInsetXRatio?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly watermarkInsetYRatio?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly endCardAssetId?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly endCardDurationSeconds?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly isEndCardEnabled?: unknown;

  @Equals(undefined, { message: BRAND_FINISHING_REVISION_MESSAGE })
  @ApiHideProperty()
  readonly isLutEnabled?: unknown;

  // isDeleted is deliberately not a settable field here (#5295). A plain
  // PATCH bypassed remove()'s last-brand guard and member reassignment,
  // letting an organization end up with zero live brands and members
  // pointing at a soft-deleted row. Soft delete only goes through
  // BrandsService.remove() (DELETE /brands/:id).
  @Equals(undefined, {
    message: 'isDeleted cannot be set through a brand update; use DELETE',
  })
  @ApiHideProperty()
  readonly isDeleted?: unknown;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Agent configuration overrides for the brand',
    required: false,
    type: Object,
  })
  readonly agentConfig?: Partial<BrandAgentConfig>;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Reference images used for generation consistency',
    required: false,
    type: [Object],
  })
  readonly referenceImages?: BrandReferenceImage[];

  @Equals(undefined, {
    message: 'brand cannot be changed through a brand update',
  })
  @ApiHideProperty()
  readonly brand?: unknown;

  @Equals(undefined, {
    message: 'brandId cannot be changed through a brand update',
  })
  @ApiHideProperty()
  readonly brandId?: unknown;

  @Equals(undefined, {
    message: 'organization must be changed through organizationId',
  })
  @ApiHideProperty()
  readonly organization?: unknown;

  @Equals(undefined, {
    message: 'user cannot be changed through a brand update',
  })
  @ApiHideProperty()
  readonly user?: unknown;

  @Equals(undefined, {
    message: 'userId cannot be changed through a brand update',
  })
  @ApiHideProperty()
  readonly userId?: unknown;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description:
      'Destination organization identifier. Providing a different value than the ' +
      "brand's current organization relocates the brand — cascading organizationId " +
      'across all brand-owned records in one transaction. Superadmin, or an owner/' +
      'admin of both the source and destination organizations, only.',
    required: false,
  })
  readonly organizationId?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description:
      'Onboarding-only control flag. When true and `label` is present, the brand ' +
      "rename cascades to the owning organization's label + slug (and the brand's " +
      'own slug), matching the single-brand onboarding workspace. Never persisted ' +
      'on the brand record.',
    required: false,
  })
  readonly syncOrganizationName?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description:
      'Onboarding-only organization label override used with syncOrganizationName. ' +
      'The server regenerates the unique organization slug and never persists this ' +
      'control field on the brand record.',
    required: false,
  })
  readonly organizationLabel?: string;
}
